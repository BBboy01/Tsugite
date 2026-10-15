import { readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { expect, test } from "playwright/test";
import type { IntelligenceFile } from "../apps/web/src/lib/editor-intelligence";
import { createMaximumBudgetFixtures } from "./helpers/typescript-worker-project-fixtures";

const source = [
  'import * as React from "react";',
  'import { label } from "typed-pkg";',
  "export const results = Promise.resolve([1, 2]).then((items) => items.map(String));",
  'export const root = document.querySelector<HTMLDivElement>("#root");',
  "export const [count] = React.useState(1);",
  "export const element = <div title={label}>{count}</div>;",
].join("\n");
const issues =
  'import * as React from "react";\nconst wrong: number = "wrong";\nconst button = <button disabled="wrong" />;';
const completion = "document.";

async function declarationFixture(): Promise<IntelligenceFile[]> {
  const reactRoot = pathToFileURL(
    `${await realpath(new URL("../node_modules/@types/react", import.meta.url))}/`,
  );
  const declarations = await Promise.all(
    ["package.json", "index.d.ts", "global.d.ts"].map(async (path) => ({
      path: `node_modules/@types/react/${path}`,
      text: await readFile(new URL(path, reactRoot), "utf8"),
    })),
  );
  declarations.push(
    {
      path: "node_modules/csstype/package.json",
      text: await readFile(new URL("../../csstype/package.json", reactRoot), "utf8"),
    },
    {
      path: "node_modules/csstype/index.d.ts",
      text: await readFile(new URL("../../csstype/index.d.ts", reactRoot), "utf8"),
    },
    { path: "node_modules/typed-pkg/package.json", text: '{"types":"types/index.d.ts"}' },
    {
      path: "node_modules/typed-pkg/types/index.d.ts",
      text: 'export declare const label: "from-package-types";',
    },
  );
  return declarations;
}

async function maximumBudgetFixture() {
  const projectDeclarations = await declarationFixture();
  return createMaximumBudgetFixtures([
    {
      path: "src/editor-tab-model.ts",
      text: "export function getFileCollaboratorCount(count: number): number { return count; }",
    },
    {
      path: "src/presence.ts",
      text: [
        "type PresenceMember = { userId: string; selectedPath?: string | null };",
        "declare const member: PresenceMember;",
        "member.",
      ].join("\n"),
    },
    {
      path: "src/issues.ts",
      text: 'const invalidCount: number = "invalid";\nexport { invalidCount };',
    },
    { path: "node_modules/@iris/shared/package.json", text: '{"types":"index.d.ts"}' },
    {
      path: "node_modules/@iris/shared/index.d.ts",
      text: "export type SharedIdentifier = string;",
    },
    ...projectDeclarations,
  ]);
}

test("real Worker resolves standard/package/React types and measures isolated query latency", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/worker-benchmark", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>TypeScript Worker benchmark</title><main>TypeScript Worker benchmark</main>",
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    }),
  );
  await page.goto("/worker-benchmark");
  await expect(page).toHaveTitle("TypeScript Worker benchmark");
  const maxBudget = await maximumBudgetFixture();
  const budgetFiles = [...maxBudget.sources, ...maxBudget.declarationFiles];
  const budgetWorkload = {
    sourceFiles: maxBudget.sources.length,
    declarationFiles: maxBudget.declarationFiles.length,
    sourceBytes: maxBudget.measuredBytes.source,
    declarationBytes: maxBudget.measuredBytes.declarations,
    maxSourceFileBytes: Math.max(
      ...maxBudget.sources.map((file) => new TextEncoder().encode(file.text).byteLength),
    ),
    maxDeclarationFileBytes: Math.max(
      ...maxBudget.declarationFiles.map((file) => new TextEncoder().encode(file.text).byteLength),
    ),
    measuredIterationsPerMethod: 10,
  };
  const cdp = await context.newCDPSession(page);
  const pageHeapBefore = await cdp.send("Runtime.getHeapUsage");
  let workerCommandId = 0;
  await page.exposeFunction("measureTypeScriptWorkerHeap", async () => {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const workerTargets = targetInfos.filter(
      (target) => target.type === "worker" && target.url.includes("typescript.worker"),
    );
    if (workerTargets.length !== 1)
      throw new Error(`Expected one TypeScript Worker target, found ${workerTargets.length}`);
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId: workerTargets[0].targetId,
      flatten: false,
    });
    try {
      const id = ++workerCommandId;
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
          if (response.id !== id) return;
          cdp.off("Target.receivedMessageFromTarget", onMessage);
          if (response.error) reject(new Error(response.error.message));
          else if (response.result) resolve(response.result);
          else reject(new Error("Worker heap response was empty"));
        };
        cdp.on("Target.receivedMessageFromTarget", onMessage);
        void cdp
          .send("Target.sendMessageToTarget", {
            sessionId,
            message: JSON.stringify({ id, method: "Runtime.getHeapUsage" }),
          })
          .catch((error: unknown) => {
            cdp.off("Target.receivedMessageFromTarget", onMessage);
            reject(error);
          });
      });
    } finally {
      await cdp.send("Target.detachFromTarget", { sessionId });
    }
  });
  const { results, fullBudget } = await page.evaluate(
    async ({ runnerPath, ...input }) => {
      const { runWorkerBenchmarks } = (await import(
        runnerPath
      )) as typeof import("./helpers/typescript-worker-benchmark-runner");
      return runWorkerBenchmarks(input);
    },
    {
      runnerPath: `/@fs/${import.meta.dirname}/helpers/typescript-worker-benchmark-runner.ts`,
      declarations: await declarationFixture(),
      mainSource: source,
      issueSource: issues,
      completionSource: completion,
      budgetFiles,
      budgetWorkload,
    },
  );
  const report = {
    environment: {
      browser: "Chromium",
      browserVersion: context.browser()?.version(),
      serving: "Vite development server; module compilation and lazy lib assets included",
      browserPlugin: "Browser plugin not available; regular Playwright used",
      memoryMeasurement:
        "CDP Runtime.getHeapUsage reads the TypeScript Dedicated Worker V8 target heap; CDP page heap is reported separately. Embedder and backing storage are included as exposed by CDP.",
      crossOriginIsolated: await page.evaluate(() => crossOriginIsolated),
    },
    pageHeapBefore,
    pageHeapAfter: await cdp.send("Runtime.getHeapUsage"),
    results,
    fullBudget,
  };
  await testInfo.attach("typescript-worker-benchmark", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log(`TypeScript Worker benchmark: ${JSON.stringify(report)}`);
  for (const result of results) {
    if ("usedSize" in result.workerHeap) {
      expect(result.workerHeap.usedSize).toBeGreaterThan(0);
      expect(result.workerHeap.backingStorageSize).toBeGreaterThan(0);
    } else expect(result.workerHeap.unavailable).not.toBe("");
    expect(result.status, JSON.stringify(result.first)).toBe("worker");
    expect(result.first.status).toBe("ok");
    if (result.first.status === "ok")
      expect(result.first.value.signature).toContain("Promise<string[]>");
    expect(result.root.status).toBe("ok");
    if (result.root.status === "ok")
      expect(result.root.value.signature).toContain("HTMLDivElement | null");
    expect(result.count.status).toBe("ok");
    if (result.count.status === "ok")
      expect(result.count.value.signature).toContain("count: number");
    expect(result.label.status).toBe("ok");
    if (result.label.status === "ok")
      expect(result.label.value.signature).toContain('"from-package-types"');
    expect(result.valid.status).toBe("empty");
    expect(result.invalid.status).toBe("ok");
    if (result.invalid.status === "ok")
      expect(result.invalid.value.filter((item) => item.code === 2322)).toHaveLength(2);
    expect(result.completionHasQuerySelector).toBe(true);
    expect(new Set(result.queryStatuses)).toEqual(new Set(["ok"]));
    expect(result.mainThread.heartbeat.samples).toBeGreaterThan(0);
    for (const query of [result.queries.cached, result.queries.afterEdit]) {
      expect(query.hover.p95Ms).toBeLessThan(2000);
      expect(query.completion.p95Ms).toBeLessThan(2000);
      expect(query.diagnostics.p95Ms).toBeLessThan(2000);
    }
  }
  expect(fullBudget.workload).toMatchObject({
    sourceFiles: 512,
    declarationFiles: 1024,
    sourceBytes: 16 * 1024 * 1024,
    declarationBytes: 8 * 1024 * 1024,
    measuredIterationsPerMethod: 10,
  });
  expect(fullBudget.status).toBe("worker");
  expect(fullBudget.firstQueries.hover.status).toBe("ok");
  if (fullBudget.firstQueries.hover.status === "ok")
    expect(fullBudget.firstQueries.hover.value.signature).toContain(
      "getFileCollaboratorCount(count: number): number",
    );
  expect(fullBudget.firstQueries.completion.status).toBe("ok");
  expect(fullBudget.firstQueries.diagnostics.status).toBe("ok");
  if (fullBudget.firstQueries.diagnostics.status === "ok")
    expect(fullBudget.firstQueries.diagnostics.value.some((item) => item.code === 2322)).toBe(true);
  expect(fullBudget.repeatedQueries.statuses).toEqual({
    hover: Array.from({ length: 10 }, () => "ok"),
    completion: Array.from({ length: 10 }, () => "ok"),
    diagnostics: Array.from({ length: 10 }, () => "ok"),
  });
  expect(fullBudget.repeatedQueries.completionMatches).toBe(10);
  expect(fullBudget.repeatedQueries.diagnosticMatches).toBe(10);
  expect(fullBudget.metrics).toEqual({
    workerStarts: 1,
    workerRetries: 0,
    readyCount: 1,
    unavailableCount: 0,
  });
  for (const query of [
    fullBudget.repeatedQueries.hover,
    fullBudget.repeatedQueries.completion,
    fullBudget.repeatedQueries.diagnostics,
  ]) {
    expect(query.samples).toBe(10);
    expect(query.p95Ms).toBeLessThan(2000);
  }
  await expect.poll(() => page.workers().length).toBe(0);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  await cdp.detach();
});
