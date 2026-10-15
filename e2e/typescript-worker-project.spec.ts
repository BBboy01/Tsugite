import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import type { CDPSession, Page } from "playwright";
import { createMaximumBudgetFixtures } from "./helpers/typescript-worker-project-fixtures";

const sharedTypes = `
export type PresenceMember = {
  userId: string;
  displayName: string;
  color: string;
  selectedPath?: string | null;
  cursor?: { anchor: number; head: number } | null;
};
export type ProjectFile = {
  id: string;
  path: string;
  language: "typescript" | "javascript";
  kind: "file";
  text: { toString(): string };
};
`;

async function typeScriptWorkerCount(page: Page) {
  return page.workers().filter((worker) => worker.url().includes("typescript.worker")).length;
}

async function measureWorkerHeap(cdp: CDPSession) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const workers = targetInfos.filter(
    (target) => target.type === "worker" && target.url.includes("typescript.worker"),
  );
  if (workers.length !== 1)
    throw new Error(`Expected one TypeScript Worker, found ${workers.length}`);
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: workers[0]!.targetId,
    flatten: false,
  });
  try {
    return await new Promise<{
      usedSize: number;
      totalSize: number;
      embedderHeapUsedSize: number;
      backingStorageSize: number;
    }>((resolve, reject) => {
      const onMessage = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const response = JSON.parse(event.message) as {
          id?: number;
          result?: {
            usedSize: number;
            totalSize: number;
            embedderHeapUsedSize: number;
            backingStorageSize: number;
          };
          error?: { message: string };
        };
        if (response.id !== 1) return;
        cdp.off("Target.receivedMessageFromTarget", onMessage);
        if (response.error) reject(new Error(response.error.message));
        else if (response.result) resolve(response.result);
        else reject(new Error("Worker heap response was empty"));
      };
      cdp.on("Target.receivedMessageFromTarget", onMessage);
      void cdp
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id: 1, method: "Runtime.getHeapUsage" }),
        })
        .catch((error: unknown) => {
          cdp.off("Target.receivedMessageFromTarget", onMessage);
          reject(error);
        });
    });
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId });
  }
}

async function productionGraph() {
  const editorFiles = await Promise.all(
    ["editor-tab-model.ts", "editor-tabs.ts", "presence.ts"].map(async (name) => ({
      path: `src/${name}`,
      text: await readFile(new URL(`../apps/web/src/lib/${name}`, import.meta.url), "utf8"),
    })),
  );
  return [
    ...editorFiles,
    {
      path: "node_modules/@iris/shared/package.json",
      text: '{"types":"index.d.ts"}',
    },
    { path: "node_modules/@iris/shared/index.d.ts", text: sharedTypes },
  ];
}

async function openBenchmarkPage(page: Page) {
  await page.route("**/worker-project-benchmark", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>TypeScript Worker project benchmark</title><main>TypeScript Worker project benchmark</main>",
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    }),
  );
  await page.goto("/worker-project-benchmark");
}

test("real Worker resolves production editor modules and follows imported type edits", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await openBenchmarkPage(page);
  const graph = await productionGraph();
  const result = await page.evaluate(async (initialFiles) => {
    const clientPath = "/src/lib/typescript-worker-client.ts";
    const { TypeScriptWorkerClient } = (await import(clientPath)) as {
      TypeScriptWorkerClient: new (files: typeof initialFiles) => {
        status: string;
        hover(query: { path: string; position: number }): Promise<{
          status: string;
          value?: { signature: string };
        }>;
        completion(query: { path: string; position: number }): Promise<{
          status: string;
          value?: { name: string }[];
        }>;
        diagnostics(query: { path: string }): Promise<{ status: string; value?: unknown[] }>;
        updateFile(file: { path: string; text: string }): Promise<{ status: string }>;
        dispose(): void;
      };
    };
    const source = initialFiles.find((file) => file.path === "src/editor-tab-model.ts")!.text;
    const presence = initialFiles.find((file) => file.path === "src/presence.ts")!;
    const functionName = "getFileCollaboratorCount";
    const hoverPosition = source.lastIndexOf(functionName) + functionName.length;
    const memberPosition = presence.text.indexOf("member.userId") + "member.".length;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes this callback without its closure.
    const summarize = (samples: number[]) => {
      const sorted = samples.toSorted((left, right) => left - right);
      return {
        samples: sorted.length,
        p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? 0,
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
      };
    };
    const startupAt = performance.now();
    const client = new TypeScriptWorkerClient(initialFiles);
    const first = await client.hover({
      path: "src/editor-tab-model.ts",
      position: hoverPosition,
    });
    const startupMs = performance.now() - startupAt;
    const firstCompletion = await client.completion({
      path: "src/presence.ts",
      position: memberPosition,
    });
    const clean = await client.diagnostics({ path: "src/editor-tab-model.ts" });
    const measureQueries = async () => {
      const hover: number[] = [];
      const completion: number[] = [];
      const diagnostics: number[] = [];
      const statuses: string[] = [];
      for (let index = 0; index < 30; index++) {
        let started = performance.now();
        const hoverResult = await client.hover({
          path: "src/editor-tab-model.ts",
          position: hoverPosition,
        });
        hover.push(performance.now() - started);
        statuses.push(hoverResult.status);
        started = performance.now();
        const completionResult = await client.completion({
          path: "src/presence.ts",
          position: memberPosition,
        });
        completion.push(performance.now() - started);
        statuses.push(completionResult.status);
        started = performance.now();
        const diagnosticResult = await client.diagnostics({ path: "src/editor-tab-model.ts" });
        diagnostics.push(performance.now() - started);
        statuses.push(diagnosticResult.status);
      }
      return {
        hover: summarize(hover),
        completion: summarize(completion),
        diagnostics: summarize(diagnostics),
        statuses: statuses.reduce<Record<string, number>>((counts, status) => {
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        }, {}),
      };
    };
    const stableQueries = await measureQueries();
    const changed = presence.text
      .replace("): number {", "): string {")
      .replace(
        "member.selectedPath === selectedPath,\n  ).length;",
        "member.selectedPath === selectedPath,\n  ).length.toString();",
      );
    const update = await client.updateFile({ path: presence.path, text: changed });
    const changedHover = await client.hover({
      path: "src/editor-tab-model.ts",
      position: hoverPosition,
    });
    const changedDiagnostics = await client.diagnostics({ path: "src/editor-tab-model.ts" });
    const changedQueries = await measureQueries();
    const restored = await client.updateFile(presence);
    const restoredDiagnostics = await client.diagnostics({ path: "src/editor-tab-model.ts" });
    const status = client.status;
    client.dispose();
    return {
      status,
      startupMs,
      sourceBytes: initialFiles
        .filter((file) => !file.path.startsWith("node_modules/"))
        .reduce((total, file) => total + new TextEncoder().encode(file.text).byteLength, 0),
      declarationBytes: initialFiles
        .filter((file) => file.path.startsWith("node_modules/"))
        .reduce((total, file) => total + new TextEncoder().encode(file.text).byteLength, 0),
      first,
      firstCompletion,
      clean,
      stableQueries,
      update,
      changedHover,
      changedDiagnostics,
      changedQueries,
      restored,
      restoredDiagnostics,
    };
  }, graph);
  await testInfo.attach("typescript-worker-production-graph", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.status).toBe("worker");
  expect(result.first, JSON.stringify(result.first)).toMatchObject({
    status: "ok",
    value: { signature: expect.stringContaining("): number") },
  });
  expect(result.firstCompletion).toMatchObject({ status: "ok" });
  expect(result.firstCompletion.value?.map((entry) => entry.name)).toContain("selectedPath");
  expect(result.clean).toEqual({ status: "empty" });
  expect(result.stableQueries.statuses).toEqual({ ok: 60, empty: 30 });
  expect(result.update).toMatchObject({ status: "ok" });
  expect(result.changedHover).toMatchObject({
    status: "ok",
    value: { signature: expect.stringContaining("): string") },
  });
  expect(result.changedDiagnostics).toMatchObject({ status: "ok" });
  expect(result.changedQueries.statuses).toEqual({ ok: 90 });
  for (const queries of [result.stableQueries, result.changedQueries]) {
    expect(queries.hover.samples).toBe(30);
    expect(queries.completion.samples).toBe(30);
    expect(queries.diagnostics.samples).toBe(30);
    expect(queries.hover.p95Ms).toBeLessThan(2000);
    expect(queries.completion.p95Ms).toBeLessThan(2000);
    expect(queries.diagnostics.p95Ms).toBeLessThan(2000);
  }
  expect(result.restored).toMatchObject({ status: "ok" });
  expect(result.restoredDiagnostics).toEqual({ status: "empty" });
  await expect.poll(() => typeScriptWorkerCount(page)).toBe(0);
});

test("real Worker client rejects exact source and declaration over-budget snapshots", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await openBenchmarkPage(page);
  const result = await page.evaluate(async () => {
    const clientPath = "/src/lib/typescript-worker-client.ts";
    const { TypeScriptWorkerClient } = (await import(clientPath)) as {
      TypeScriptWorkerClient: new (files: readonly { path: string; text: string }[]) => {
        status: string;
        disabledReason?: string;
        syncWorkspace(files: readonly { path: string; text: string }[]): Promise<unknown>;
        hover(query: { path: string; position: number }): Promise<unknown>;
        dispose(): void;
      };
    };
    const sourceFiles = Array.from({ length: 512 }, (_, index) => ({
      path: `src/pressure-${index}.ts`,
      text: index === 511 ? "x".repeat(32 * 1024 + 1) : "x".repeat(32 * 1024),
    }));
    const declarationFiles = Array.from({ length: 1024 }, (_, index) => ({
      path: `node_modules/pkg/file-${index}.d.ts`,
      text: index === 1023 ? "x".repeat(8 * 1024 + 1) : "x".repeat(8 * 1024),
    }));
    const encoder = new TextEncoder();
    const sourceBytes = sourceFiles.reduce(
      (total, file) => total + encoder.encode(file.text).byteLength,
      0,
    );
    const declarationBytes = declarationFiles.reduce(
      (total, file) => total + encoder.encode(file.text).byteLength,
      0,
    );
    const source = new TypeScriptWorkerClient(sourceFiles);
    const declaration = new TypeScriptWorkerClient(declarationFiles);
    const output: Record<string, unknown> = {
      sourceBytes,
      declarationBytes,
      source: { status: source.status, reason: source.disabledReason },
      declaration: { status: declaration.status, reason: declaration.disabledReason },
    };
    const recoveryFiles = [{ path: "src/recovered.ts", text: "export const recovered = 1;" }];
    output.sourceRecovery = await source.syncWorkspace(recoveryFiles);
    output.declarationRecovery = await declaration.syncWorkspace(recoveryFiles);
    output.sourceQuery = await source.hover({ path: "src/recovered.ts", position: 20 });
    output.declarationQuery = await declaration.hover({ path: "src/recovered.ts", position: 20 });
    output.sourceRecoveredStatus = source.status;
    output.declarationRecoveredStatus = declaration.status;
    source.dispose();
    declaration.dispose();
    return output;
  });
  await testInfo.attach("typescript-worker-over-budget-recovery", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.sourceBytes).toBe(16 * 1024 * 1024 + 1);
  expect(result.declarationBytes).toBe(8 * 1024 * 1024 + 1);
  expect(result.source).toMatchObject({
    status: "disabled",
    reason: "TypeScript source workspace limit exceeded",
  });
  expect(result.declaration).toMatchObject({
    status: "disabled",
    reason: "TypeScript declaration workspace limit exceeded",
  });
  expect(result.sourceRecovery).toMatchObject({ status: "ok" });
  expect(result.declarationRecovery).toMatchObject({ status: "ok" });
  expect(result.sourceQuery).toMatchObject({ status: "ok" });
  expect(result.declarationQuery).toMatchObject({ status: "ok" });
  expect(result.sourceRecoveredStatus).toBe("worker");
  expect(result.declarationRecoveredStatus).toBe("worker");
  await expect.poll(() => typeScriptWorkerCount(page)).toBe(0);
});

test("real Worker client enforces the per-file source and declaration byte boundary", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await openBenchmarkPage(page);
  const result = await page.evaluate(async () => {
    const clientPath = "/src/lib/typescript-worker-client.ts";
    const { TypeScriptWorkerClient } = (await import(clientPath)) as {
      TypeScriptWorkerClient: new (files: readonly { path: string; text: string }[]) => {
        status: string;
        disabledReason?: string;
        dispose(): void;
      };
    };
    const exact = "x".repeat(1024 * 1024);
    const sourceExact = new TypeScriptWorkerClient([{ path: "src/exact.ts", text: exact }]);
    const sourceOver = new TypeScriptWorkerClient([{ path: "src/over.ts", text: `${exact}x` }]);
    const declarationExact = new TypeScriptWorkerClient([
      { path: "node_modules/pkg/index.d.ts", text: exact },
    ]);
    const declarationOver = new TypeScriptWorkerClient([
      { path: "node_modules/pkg/over.d.ts", text: `${exact}x` },
    ]);
    const output = {
      sourceExact: { status: sourceExact.status, reason: sourceExact.disabledReason },
      sourceOver: { status: sourceOver.status, reason: sourceOver.disabledReason },
      declarationExact: {
        status: declarationExact.status,
        reason: declarationExact.disabledReason,
      },
      declarationOver: { status: declarationOver.status, reason: declarationOver.disabledReason },
    };
    sourceExact.dispose();
    sourceOver.dispose();
    declarationExact.dispose();
    declarationOver.dispose();
    return output;
  });
  expect(result.sourceExact).toMatchObject({ status: "worker" });
  expect(result.sourceOver).toMatchObject({
    status: "disabled",
    reason: "TypeScript source file limit exceeded",
  });
  expect(result.declarationExact).toMatchObject({ status: "worker" });
  expect(result.declarationOver).toMatchObject({
    status: "disabled",
    reason: "TypeScript declaration byte limit exceeded",
  });
  await expect.poll(() => typeScriptWorkerCount(page)).toBe(0);
});

test("maximum legal source and declaration snapshots answer the first query", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await openBenchmarkPage(page);
  const cdp = await context.newCDPSession(page);
  const pageHeapBefore = await cdp.send("Runtime.getHeapUsage");
  await page.exposeFunction("measureMaximumBudgetWorkerHeap", () => measureWorkerHeap(cdp));
  const graph = await productionGraph();
  const { sources, declarationFiles, measuredBytes } = createMaximumBudgetFixtures(graph);
  expect(sources).toHaveLength(512);
  expect(declarationFiles).toHaveLength(1024);
  expect(measuredBytes).toEqual({ source: 16 * 1024 * 1024, declarations: 8 * 1024 * 1024 });
  const editorModel = sources.find((file) => file.path === "src/editor-tab-model.ts")!;
  const queryPosition = editorModel.text.indexOf("collaboratorCount");

  const result = await page.evaluate(
    async ({ files, sourceBytes, declarationBytes, position }) => {
      const clientPath = "/src/lib/typescript-worker-client.ts";
      const { TypeScriptWorkerClient } = (await import(clientPath)) as {
        TypeScriptWorkerClient: new (files: readonly { path: string; text: string }[]) => {
          status: string;
          disabledReason?: string;
          hover(query: { path: string; position: number }): Promise<{
            status: string;
            value?: { signature: string };
          }>;
          dispose(): void;
        };
      };
      const exposedWindow = window as Window & {
        measureMaximumBudgetWorkerHeap?: () => Promise<{
          usedSize: number;
          totalSize: number;
          embedderHeapUsedSize: number;
          backingStorageSize: number;
        }>;
      };
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((entries) =>
        entries.getEntries().forEach((entry) => longTasks.push(entry.duration)),
      );
      observer.observe({ type: "longtask", buffered: true });
      const startedAt = performance.now();
      const client = new TypeScriptWorkerClient(files);
      const queryResult = await client.hover({ path: "src/editor-tab-model.ts", position });
      const startupMs = performance.now() - startedAt;
      observer.disconnect();
      let workerHeap:
        | {
            usedSize: number;
            totalSize: number;
            embedderHeapUsedSize: number;
            backingStorageSize: number;
          }
        | { unavailable: string };
      try {
        if (!exposedWindow.measureMaximumBudgetWorkerHeap)
          throw new Error("Worker heap measurement binding is unavailable");
        workerHeap = await exposedWindow.measureMaximumBudgetWorkerHeap();
      } catch (error) {
        workerHeap = {
          unavailable: error instanceof Error ? error.message : String(error),
        };
      }
      const output = {
        status: client.status,
        disabledReason: client.disabledReason,
        queryResult,
        startupMs,
        longTasks,
        workerHeap,
        sourceBytes,
        declarationBytes,
      };
      client.dispose();
      return output;
    },
    {
      files: [...sources, ...declarationFiles],
      sourceBytes: measuredBytes.source,
      declarationBytes: measuredBytes.declarations,
      position: queryPosition,
    },
  );
  const pageHeapAfter = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  await testInfo.attach("typescript-worker-max-budget", {
    body: JSON.stringify({ pageHeapBefore, pageHeapAfter, result }, null, 2),
    contentType: "application/json",
  });
  expect(result.status, result.disabledReason).toBe("worker");
  expect(result.queryResult.status).toBe("ok");
  expect(result.queryResult.value?.signature).toContain("collaboratorCount: number");
  expect(result.startupMs).toBeLessThan(2000);
  expect(result.sourceBytes).toBe(16 * 1024 * 1024);
  expect(result.declarationBytes).toBe(8 * 1024 * 1024);
  await expect.poll(() => typeScriptWorkerCount(page)).toBe(0);
});
