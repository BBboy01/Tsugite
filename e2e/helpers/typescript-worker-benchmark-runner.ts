import type {
  EditorIntelligence,
  IntelligenceFile,
} from "../../apps/web/src/lib/editor-intelligence";

export type WorkerBenchmarkInput = {
  declarations: IntelligenceFile[];
  mainSource: string;
  issueSource: string;
  completionSource: string;
  budgetFiles: IntelligenceFile[];
  budgetWorkload: {
    sourceFiles: number;
    declarationFiles: number;
    sourceBytes: number;
    declarationBytes: number;
    maxSourceFileBytes: number;
    maxDeclarationFileBytes: number;
    measuredIterationsPerMethod: number;
  };
};

export async function runWorkerBenchmarks({
  declarations,
  mainSource,
  issueSource,
  completionSource,
  budgetFiles: maxBudgetFiles,
  budgetWorkload: maxBudgetWorkload,
}: WorkerBenchmarkInput) {
  const modulePath = "/src/lib/typescript-worker-client.ts";
  const imported = (await import(/* @vite-ignore */ modulePath)) as {
    TypeScriptWorkerClient: new (files: readonly IntelligenceFile[]) => EditorIntelligence & {
      status: string;
      disabledReason?: string;
      getMetricsSnapshot: () => {
        workerStarts: number;
        workerRetries: number;
        readyCount: number;
        unavailableCount: number;
      };
    };
  };
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes the callback without its closure.
  const round = (value: number) => Math.round(value * 100) / 100;
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes the callback without its closure.
  const measureWorkerHeap = () => {
    const exposedWindow = window as Window & {
      measureTypeScriptWorkerHeap?: () => Promise<{
        usedSize: number;
        totalSize: number;
        embedderHeapUsedSize: number;
        backingStorageSize: number;
      }>;
    };
    if (!exposedWindow.measureTypeScriptWorkerHeap)
      throw new Error("Worker heap measurement binding is unavailable");
    return exposedWindow.measureTypeScriptWorkerHeap();
  };
  const distribution = (samples: number[]) => {
    const sorted = samples.toSorted((left, right) => left - right);
    return {
      samples: sorted.length,
      p50Ms: round(sorted[Math.ceil(sorted.length * 0.5) - 1] ?? 0),
      p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0),
      maxMs: round(sorted.at(-1) ?? 0),
    };
  };
  const output = [];
  for (const sourceCount of [3, 128, 512]) {
    const files: IntelligenceFile[] = [
      { path: "src/main.tsx", text: mainSource },
      { path: "src/issues.tsx", text: issueSource },
      { path: "src/complete.ts", text: completionSource },
      ...Array.from({ length: sourceCount - 3 }, (_, index) => ({
        path: `src/module${index}.ts`,
        text: `export const value${index}: number = ${index};\n${"// generated source\n".repeat(100)}`,
      })),
      ...declarations,
    ];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    const supportsLongTasks = PerformanceObserver.supportedEntryTypes.includes("longtask");
    if (supportsLongTasks) observer.observe({ type: "longtask" });
    const heartbeats: number[] = [];
    let previous = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      heartbeats.push(now - previous);
      previous = now;
    }, 16);
    const start = performance.now();
    const client = new imported.TypeScriptWorkerClient(files);
    try {
      const first = await client.hover({
        path: "src/main.tsx",
        position: mainSource.indexOf("results") + 1,
      });
      const startupMs = round(performance.now() - start);
      const root = await client.hover({
        path: "src/main.tsx",
        position: mainSource.indexOf("root") + 1,
      });
      const count = await client.hover({
        path: "src/main.tsx",
        position: mainSource.indexOf("count") + 1,
      });
      const label = await client.hover({
        path: "src/main.tsx",
        position: mainSource.lastIndexOf("label") + 1,
      });
      const valid = await client.diagnostics({ path: "src/main.tsx" });
      const invalid = await client.diagnostics({ path: "src/issues.tsx" });
      const candidates = await client.completion({
        path: "src/complete.ts",
        position: completionSource.length,
      });
      const queryStatuses: string[] = [];
      const measureQueries = async (afterEdit: boolean) => {
        const publishSamples: number[] = [];
        const hoverSamples: number[] = [];
        const completionSamples: number[] = [];
        const diagnosticSamples: number[] = [];
        for (let index = 0; index < 30; index++) {
          if (afterEdit) {
            const before = performance.now();
            const published = await client.updateFile({
              path: "src/main.tsx",
              text: `${mainSource}\n// revision ${index}`,
            });
            publishSamples.push(performance.now() - before);
            queryStatuses.push(published.status);
          }
          let before = performance.now();
          const hover = await client.hover({
            path: "src/main.tsx",
            position: mainSource.indexOf("results") + 1,
          });
          hoverSamples.push(performance.now() - before);
          before = performance.now();
          const candidate = await client.completion({
            path: "src/complete.ts",
            position: completionSource.length,
          });
          completionSamples.push(performance.now() - before);
          before = performance.now();
          const diagnostic = await client.diagnostics({ path: "src/issues.tsx" });
          diagnosticSamples.push(performance.now() - before);
          queryStatuses.push(hover.status, candidate.status, diagnostic.status);
        }
        return {
          publish: distribution(publishSamples),
          hover: distribution(hoverSamples),
          completion: distribution(completionSamples),
          diagnostics: distribution(diagnosticSamples),
        };
      };
      const cached = await measureQueries(false);
      const afterEdit = await measureQueries(true);
      await new Promise((resolve) => setTimeout(resolve, 32));
      let workerHeap:
        | {
            usedSize: number;
            totalSize: number;
            embedderHeapUsedSize: number;
            backingStorageSize: number;
          }
        | { unavailable: string };
      try {
        workerHeap = await measureWorkerHeap();
      } catch (error) {
        workerHeap = {
          unavailable: error instanceof Error ? error.message : String(error),
        };
      }
      output.push({
        sourceCount,
        sourceBytes: files
          .filter((file) => !file.path.startsWith("node_modules/"))
          .reduce((total, file) => total + new TextEncoder().encode(file.text).byteLength, 0),
        declarationBytes: declarations.reduce(
          (total, file) => total + new TextEncoder().encode(file.text).byteLength,
          0,
        ),
        startupMs,
        status: client.status,
        disabledReason: client.disabledReason,
        first,
        root,
        count,
        label,
        valid,
        invalid,
        completionHasQuerySelector:
          candidates.status === "ok" &&
          candidates.value.some((entry) => entry.name === "querySelector"),
        workerHeap,
        queryStatuses,
        queries: { cached, afterEdit },
        mainThread: {
          longTasksSupported: supportsLongTasks,
          longTaskCount: longTasks.length,
          longestTaskMs: round(Math.max(0, ...longTasks)),
          heartbeat: distribution(heartbeats),
        },
      });
    } finally {
      client.dispose();
      clearInterval(interval);
      observer.disconnect();
    }
  }
  const budgetStarted = performance.now();
  const budgetClient = new imported.TypeScriptWorkerClient(maxBudgetFiles);
  const budgetHover = await budgetClient.hover({
    path: "src/editor-tab-model.ts",
    position:
      maxBudgetFiles
        .find((file) => file.path === "src/editor-tab-model.ts")!
        .text.indexOf("getFileCollaboratorCount") + 1,
  });
  const startupMs = round(performance.now() - budgetStarted);
  const budgetCompletion = await budgetClient.completion({
    path: "src/presence.ts",
    position:
      maxBudgetFiles.find((file) => file.path === "src/presence.ts")!.text.lastIndexOf("member.") +
      "member.".length,
  });
  const budgetDiagnostics = await budgetClient.diagnostics({ path: "src/issues.ts" });
  const budgetStatus = budgetClient.status;
  const budgetMetrics = budgetClient.getMetricsSnapshot();
  const hasSelectedPath = (result: typeof budgetCompletion) =>
    result.status === "ok" && result.value.some((entry) => entry.name === "selectedPath");
  const hasExpectedDiagnostic = (result: typeof budgetDiagnostics) =>
    result.status === "ok" && result.value.some((item) => item.code === 2322);
  const samples = {
    hover: [] as number[],
    completion: [] as number[],
    diagnostics: [] as number[],
  };
  const statuses = {
    hover: [] as string[],
    completion: [] as string[],
    diagnostics: [] as string[],
  };
  let completionMatches = 0;
  let diagnosticMatches = 0;
  for (let index = 0; index < maxBudgetWorkload.measuredIterationsPerMethod; index++) {
    let before = performance.now();
    const hover = await budgetClient.hover({
      path: "src/editor-tab-model.ts",
      position:
        maxBudgetFiles
          .find((file) => file.path === "src/editor-tab-model.ts")!
          .text.indexOf("getFileCollaboratorCount") + 1,
    });
    samples.hover.push(performance.now() - before);
    statuses.hover.push(hover.status);

    before = performance.now();
    const completionResult = await budgetClient.completion({
      path: "src/presence.ts",
      position:
        maxBudgetFiles
          .find((file) => file.path === "src/presence.ts")!
          .text.lastIndexOf("member.") + "member.".length,
    });
    samples.completion.push(performance.now() - before);
    statuses.completion.push(completionResult.status);
    if (hasSelectedPath(completionResult)) completionMatches++;

    before = performance.now();
    const diagnostics = await budgetClient.diagnostics({ path: "src/issues.ts" });
    samples.diagnostics.push(performance.now() - before);
    statuses.diagnostics.push(diagnostics.status);
    if (hasExpectedDiagnostic(diagnostics)) diagnosticMatches++;
  }
  await new Promise((resolve) => setTimeout(resolve, 32));
  let workerHeap:
    | {
        usedSize: number;
        totalSize: number;
        embedderHeapUsedSize: number;
        backingStorageSize: number;
      }
    | { unavailable: string };
  try {
    workerHeap = await measureWorkerHeap();
  } catch (error) {
    workerHeap = {
      unavailable: error instanceof Error ? error.message : String(error),
    };
  }
  budgetClient.dispose();
  return {
    results: output,
    fullBudget: {
      workload: maxBudgetWorkload,
      status: budgetStatus,
      metrics: budgetMetrics,
      startupMs,
      firstQueries: {
        hover: budgetHover,
        completion: budgetCompletion,
        diagnostics: budgetDiagnostics,
      },
      repeatedQueries: {
        hover: distribution(samples.hover),
        completion: distribution(samples.completion),
        diagnostics: distribution(samples.diagnostics),
        statuses,
        completionMatches,
        diagnosticMatches,
      },
      workerHeap,
    },
  };
}
