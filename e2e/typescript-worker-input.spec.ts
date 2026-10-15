import { createFile, createProjectDoc, deleteFile, getFileByPath, listFiles } from "@iris/shared";
import { expect, test, type Page } from "playwright/test";
import type { RoomTypeScriptIntelligence } from "../apps/web/src/lib/room-typescript-intelligence";
import type { TypeScriptWorkerClient } from "../apps/web/src/lib/typescript-worker-client";
import { validateWorkspaceFiles } from "../apps/web/src/lib/typescript-worker-protocol";
import { createMaximumBudgetFixtures } from "./helpers/typescript-worker-project-fixtures";
import type { WorkspaceProfile } from "./workspace-profile-harness";

type QuerySample = {
  method: string;
  status: string;
  durationMs: number;
  startedDuringInput: boolean;
  completedDuringInput: boolean;
  inputRound: number;
};
type InputRun = {
  running: boolean;
  typing: boolean;
  round: number;
  queries: QuerySample[];
  longTasks: number[];
  done?: Promise<void>;
  observer?: PerformanceObserver;
};

declare global {
  interface Window {
    workerInputOwner: RoomTypeScriptIntelligence;
    workerInputRun: InputRun;
  }
}

function summarize(samples: number[]) {
  const sorted = samples.toSorted((left, right) => left - right);
  return {
    count: sorted.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? 0,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
  };
}

function createInputFixtures(maximum: boolean) {
  const sources = [
    {
      path: "src/editor-tab-model.ts",
      text: "export type EditorTabViewModel = { label: string };\nexport const trackedValue = 1;",
    },
    {
      path: "src/App.tsx",
      text: [
        'import { trackedValue } from "./editor-tab-model";',
        "export const visible = trackedValue;",
        "// input ",
      ].join("\n"),
    },
    { path: "src/other.ts", text: "export const other = true;" },
  ];
  const declarationFiles = [
    { path: "package.json", text: "{}" },
    { path: "node_modules/@iris/shared/package.json", text: '{"types":"index.d.ts"}' },
    { path: "node_modules/@iris/shared/index.d.ts", text: "export type Member = { id: string };" },
  ];
  if (!maximum) return { sources, declarationFiles };
  const fixture = createMaximumBudgetFixtures([...sources, ...declarationFiles]);
  const active = sources.find(({ path }) => path === "src/App.tsx")!;
  const suffix = "\n// input ";
  const prefix = active.text.slice(0, -suffix.length);
  const padding = 28 * 1024 - Buffer.byteLength(prefix + suffix);
  fixture.sources[511] = {
    path: active.path,
    text: `${prefix}\n//${"x".repeat(padding - 3)}${suffix}`,
  };
  return fixture;
}

async function useProductionHarness(page: Page, declarations: { path: string; text: string }[]) {
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: new URL(route.request().url()).search
        ? `import ${JSON.stringify(`/@fs/${import.meta.dirname}/workspace-profile-harness.tsx`)};`
        : 'import "/src/main.tsx?worker-input";',
    }),
  );
  await page.route("**/src/lib/room-typescript-intelligence.ts*", (route) => {
    if (new URL(route.request().url()).searchParams.has("worker-input-original")) {
      return route.continue();
    }
    return route.fulfill({
      contentType: "application/javascript",
      body: `
        import { RoomTypeScriptIntelligence as Original } from "/src/lib/room-typescript-intelligence.ts?worker-input-original";
        export * from "/src/lib/room-typescript-intelligence.ts?worker-input-original";
        export class RoomTypeScriptIntelligence extends Original {
          constructor(...args) {
            super(...args);
            const subscribe = this.subscribeServiceStatus;
            // StrictMode also constructs an unused owner; observe only the committed subscriber.
            this.subscribeServiceStatus = (listener) => {
              window.workerInputOwner = this;
              return subscribe(listener);
            };
          }
        }
      `,
    });
  });
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, listener) {
          listener({ type: "state", state: "installing" });
          listener({ type: "state", state: "paused" });
        }
        async restart(...args) { return this.start(...args); }
        async readTypeScriptDeclarations() {
          const response = await fetch("/__fixtures/typescript-declarations.json");
          if (!response.ok) throw new Error("Declaration fixture unavailable");
          return response.json();
        }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles() { return { packageChanged: false }; }
        dispose() {}
      }`,
    }),
  );
  await page.route("**/__fixtures/typescript-declarations.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(declarations),
    }),
  );
}

for (const maximum of [false, true]) {
  test(`keeps real editor input responsive with ${maximum ? "maximum-budget" : "representative"} Worker queries`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = createInputFixtures(maximum);
    const sourceBytes = fixture.sources.reduce(
      (bytes, file) => bytes + Buffer.byteLength(file.text),
      0,
    );
    const declarationBytes = fixture.declarationFiles.reduce(
      (bytes, file) => bytes + Buffer.byteLength(file.text),
      0,
    );
    expect(fixture.sources).toHaveLength(maximum ? 512 : 3);
    if (maximum) expect(sourceBytes).toBe(16 * 1024 * 1024 - 4096);
    expect(fixture.declarationFiles).toHaveLength(maximum ? 1024 : 3);
    expect(
      validateWorkspaceFiles([...fixture.sources, ...fixture.declarationFiles]),
    ).toBeUndefined();
    const doc = createProjectDoc();
    for (const file of listFiles(doc)) deleteFile(doc, file.id);
    for (const file of fixture.sources) createFile(doc, file.path, "typescript", file.text);
    createFile(doc, "package.json", "javascript", "{}");
    doc.commit();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("iris.language", "en");
    });
    await useProductionHarness(page, fixture.declarationFiles);
    await page.routeWebSocket("**/ws/**", (socket) =>
      socket.onMessage((message) => {
        if (typeof message !== "string") {
          doc.import(new Uint8Array(message));
          socket.send(JSON.stringify({ type: "update:ack" }));
          return;
        }
        const payload = JSON.parse(message) as { type: string; roomId?: string };
        if (payload.type !== "join") return;
        socket.send(JSON.stringify({ type: "ready", roomId: payload.roomId }));
        socket.send(Buffer.from(doc.export({ mode: "snapshot" })));
        socket.send(JSON.stringify({ type: "presence:list", members: [] }));
      }),
    );
    try {
      await page.goto(`/room/worker-input-${crypto.randomUUID()}`, {
        waitUntil: "domcontentloaded",
      });
      const editor = page.locator(".cm-content");
      await expect(editor).toBeFocused({ timeout: 30_000 });
      await expect(editor).toContainText("trackedValue");
      await expect(
        page.getByRole("region", { name: "Live preview" }).getByText("paused", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(() => page.evaluate(() => window.workerInputOwner?.getDeclarationsStatus().status), {
          timeout: 30_000,
        })
        .toBe("ready");
      await expect
        .poll(() => page.evaluate(() => window.workerInputOwner?.getServiceStatus().state), {
          timeout: 90_000,
        })
        .toBe("ready");
      const declarations = await page.evaluate(() => {
        const files = window.workerInputOwner.getDeclarationsSnapshot();
        return {
          count: files.length,
          bytes: files.reduce(
            (bytes, file) => bytes + new TextEncoder().encode(file.text).byteLength,
            0,
          ),
        };
      });
      expect(declarations).toEqual({
        count: fixture.declarationFiles.length,
        bytes: declarationBytes,
      });
      await expect
        .poll(
          () =>
            page.workers().filter((worker) => worker.url().includes("typescript.worker")).length,
          { timeout: 30_000 },
        )
        .toBe(1);
      await page.keyboard.press("ControlOrMeta+End");
      await expect(editor.locator(".cm-activeLine")).toHaveText("// input ");
      await page.evaluate(() => {
        const run: InputRun = {
          running: true,
          typing: false,
          round: -1,
          queries: [],
          longTasks: [],
        };
        window.workerInputRun = run;
        run.observer = new PerformanceObserver((list) => {
          run.longTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        run.observer.observe({ type: "longtask" });
        const intelligence = window.workerInputOwner.intelligence;
        const query = { path: "src/editor-tab-model.ts", position: 72 };
        run.done = (async () => {
          while (run.running) {
            await Promise.all(
              ["hover", "completion", "diagnostics"].map(async (method) => {
                const started = performance.now();
                const startedDuringInput = run.typing;
                const inputRound = run.round;
                const result =
                  method === "hover"
                    ? await intelligence.hover(query)
                    : method === "completion"
                      ? await intelligence.completion(query)
                      : await intelligence.diagnostics(query);
                run.queries.push({
                  method,
                  status: result.status,
                  durationMs: performance.now() - started,
                  startedDuringInput,
                  completedDuringInput: run.typing,
                  inputRound: inputRound === run.round ? inputRound : -1,
                });
              }),
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        })();
      });
      const rounds = [];
      let inserted = "";
      for (let round = 0; round < 5; round++) {
        await page.evaluate((inputRound) => {
          window.workspaceProfile = { commits: [], inputFrames: [] };
          window.workerInputRun.typing = true;
          window.workerInputRun.round = inputRound;
        }, round);
        const marker = `round${round}-abcdefghijklmnop `;
        await editor.pressSequentially(marker, { delay: 20 });
        await page.evaluate(() => {
          window.workerInputRun.typing = false;
        });
        inserted += marker;
        await expect(editor.locator(".cm-activeLine")).toHaveText(`// input ${inserted}`);
        await expect
          .poll(() => getFileByPath(doc, "src/App.tsx")!.text.toString().endsWith(inserted))
          .toBe(true);
        await expect
          .poll(() => page.evaluate(() => window.workspaceProfile.inputFrames.length))
          .toBe(marker.length);
        const frames = await page.evaluate(() => {
          const profile: WorkspaceProfile = window.workspaceProfile;
          return profile.inputFrames;
        });
        const overlap = await page.evaluate((inputRound) => {
          const successful = window.workerInputRun.queries.filter(
            (query) =>
              query.inputRound === inputRound &&
              query.startedDuringInput &&
              query.completedDuringInput &&
              ["ok", "empty"].includes(query.status),
          );
          return {
            total: successful.length,
            byMethod: successful.reduce<Record<string, number>>((counts, { method }) => {
              counts[method] = (counts[method] ?? 0) + 1;
              return counts;
            }, {}),
          };
        }, round);
        for (const method of ["hover", "completion", "diagnostics"])
          expect(overlap.byMethod[method] ?? 0).toBeGreaterThan(0);
        rounds.push({ round, input: summarize(frames), successfulQueriesDuringInput: overlap });
      }
      const state = await page.evaluate(async () => {
        const run = window.workerInputRun;
        run.running = false;
        await run.done;
        run.longTasks.push(...(run.observer?.takeRecords().map((entry) => entry.duration) ?? []));
        run.observer?.disconnect();
        const owner = window.workerInputOwner;
        const query = { path: "src/App.tsx", position: 31 };
        return {
          queries: run.queries,
          longTasks: run.longTasks,
          service: owner.getServiceStatus(),
          metrics: (owner.intelligence as TypeScriptWorkerClient).getMetricsSnapshot(),
          hover: await owner.intelligence.hover(query),
          definition: await owner.intelligence.definition(query),
          diagnostics: await owner.intelligence.diagnostics({ path: query.path }),
        };
      });
      expect(state.service).toMatchObject({ state: "ready" });
      expect(state.metrics).toMatchObject({ workerStarts: 1, workerRetries: 0 });
      expect(state.queries.length).toBeGreaterThan(0);
      expect(
        state.queries.filter(
          ({ startedDuringInput, completedDuringInput }) =>
            startedDuringInput && completedDuringInput,
        ).length,
      ).toBeGreaterThan(0);
      expect(
        state.queries.filter(({ status }) => !["ok", "empty", "cancelled"].includes(status)),
      ).toEqual([]);
      expect(state.hover).toMatchObject({ status: "ok" });
      expect(state.definition).toMatchObject({
        status: "ok",
        value: [expect.objectContaining({ path: "src/editor-tab-model.ts" })],
      });
      expect(state.diagnostics).toEqual({ status: "empty" });
      await page.screenshot({ path: testInfo.outputPath("typescript-worker-input.png") });
      await page.keyboard.press("ControlOrMeta+Home");
      for (let index = 0; index < 10; index++) await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Shift+F10");
      await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "src/editor-tab-model.ts", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(editor).toBeFocused();
      await expect(editor.locator(".cm-activeLine")).toHaveText("export const trackedValue = 1;");
      expect(
        page.workers().filter((worker) => worker.url().includes("typescript.worker")),
      ).toHaveLength(1);
      await expect(page).toHaveTitle("Tsugite multiplayer editor");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
      const report = {
        workload: maximum ? "maximum-budget" : "representative",
        sourceCount: fixture.sources.length,
        sourceBytes,
        sourceBytesAfterInput: sourceBytes + Buffer.byteLength(inserted),
        inputCount: rounds.reduce((count, sample) => count + sample.input.count, 0),
        declarations,
        rounds,
        longTasks: summarize(state.longTasks),
        queryStatuses: state.queries.reduce<Record<string, number>>((counts, { status }) => {
          counts[status] = (counts[status] ?? 0) + 1;
          return counts;
        }, {}),
        queryLatency: summarize(state.queries.map(({ durationMs }) => durationMs)),
        completedQueriesDuringInput: state.queries.filter(
          ({ startedDuringInput, completedDuringInput }) =>
            startedDuringInput && completedDuringInput,
        ).length,
        metrics: state.metrics,
      };
      console.info("TYPESCRIPT_WORKER_INPUT", JSON.stringify(report));
      await testInfo.attach("typescript-worker-input.json", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({ path: testInfo.outputPath("typescript-worker-navigation.png") });
    } finally {
      await page.close();
      doc.free();
    }
  });
}
