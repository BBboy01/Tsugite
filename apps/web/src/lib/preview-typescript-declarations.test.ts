import { expect, spyOn, test } from "bun:test";
import type { IntelligenceFile } from "./editor-intelligence";
import { PreviewTypeScriptDeclarations } from "./preview-typescript-declarations";
import { TypeScriptImportIndex } from "./typescript-import-index";

function target() {
  let files: readonly IntelligenceFile[] = [];
  let state = "ready";
  let generation = 0;
  let sources: readonly IntelligenceFile[] = [];
  return {
    setSources: (next: readonly IntelligenceFile[]) => {
      sources = next;
    },
    current: () => ({ files, state }),
    prepareDeclarations: () => {
      generation++;
      files = [];
      state = "loading";
    },
    clearDeclarations: async (reason?: string) => {
      generation++;
      files = [];
      state = reason ? "unavailable" : "ready";
    },
    loadDeclarations: async (
      read: (sources: readonly IntelligenceFile[]) => Promise<readonly IntelligenceFile[]>,
    ) => {
      const current = ++generation;
      state = "loading";
      try {
        const result = await read(sources);
        if (current === generation) {
          files = result;
          state = "ready";
        }
      } catch {
        if (current === generation) {
          files = [];
          state = "unavailable";
        }
      }
    },
  };
}
const declarations = [
  { path: "node_modules/pkg/index.d.ts", text: 'export declare const value: "ok";' },
];

test("scans declarations when installed runtime is paused without waiting for preview", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const runtime = { readTypeScriptDeclarations: async () => declarations };
  sync.onRuntimeState("installing", runtime);
  expect(sink.current().state).toBe("loading");
  await sync.onRuntimeState("paused", runtime);
  expect(sink.current()).toEqual({ state: "ready", files: declarations });
});

test("failed installation cancels old scans and marks types unavailable", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const pending = Promise.withResolvers<IntelligenceFile[]>();
  const runtime = { readTypeScriptDeclarations: () => pending.promise };
  sync.onRuntimeState("installing", runtime);
  const scan = sync.onRuntimeState("starting", runtime);
  sync.onRuntimeState("installing", runtime);
  await sync.onRuntimeState("error", runtime, "install-failed");
  pending.resolve(declarations);
  await scan;
  expect(sink.current()).toEqual({ state: "unavailable", files: [] });
});

test("source import changes refresh types but ordinary edits keep the existing declaration scan", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  let available = declarations;
  const runtime = { readTypeScriptDeclarations: async () => available };
  const files = [{ path: "app.ts", text: 'import { value } from "pkg"; value;' }];
  sink.setSources(files);
  await sync.onRuntimeState("starting", runtime);
  await sync.syncSources(runtime, files);
  available = [{ path: "node_modules/next/index.d.ts", text: "export {};" }];
  await sync.syncSources(runtime, [
    { path: "app.ts", text: 'import { value } from "pkg"; value; // edit' },
  ]);
  expect(sink.current().files).toEqual(declarations);
  const next = [{ path: "app.ts", text: 'import { value } from "next"; value;' }];
  sink.setSources(next);
  await sync.syncSources(runtime, next);
  expect(sink.current().files).toEqual(available);
});

test("import-looking strings and comments do not refresh or clear declarations", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const initial = [{ path: "app.ts", text: "const example = 'ordinary text';" }];
  sink.setSources(initial);
  let reads = 0;
  const scanFailureMarker = ["https:", "", "example.test"].join("/") + "/";
  const runtime = {
    readTypeScriptDeclarations: async (sources: readonly IntelligenceFile[] = []) => {
      reads++;
      if (sources.some(({ text }) => text.includes(scanFailureMarker))) {
        throw new Error("TypeScript declaration scan disabled");
      }
      return declarations;
    },
  };
  await sync.onRuntimeState("paused", runtime);
  await sync.syncSources(runtime, [
    {
      path: "app.ts",
      text: `const example = 'import "https://example.test/pkg"'; // import "https://example.test/comment"\nconst pattern = /import "https:\\/\\/example.test\\/pkg"/;`,
    },
  ]);
  expect(reads).toBe(1);
  expect(sink.current()).toEqual({ state: "ready", files: declarations });
});

test("dynamic imports inside template expressions refresh declarations", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const current = [{ path: "app.ts", text: 'const loaded = `value ${import("pkg")}`;' }];
  sink.setSources(current);
  const next = [{ path: "app.ts", text: 'const loaded = `value ${import("next")}`;' }];
  const nextDeclarations = [{ path: "node_modules/next/index.d.ts", text: "export {};" }];
  const runtime = {
    readTypeScriptDeclarations: async (sources: readonly IntelligenceFile[] = []) =>
      sources.some(({ text }) => text.includes('import("next")')) ? nextDeclarations : declarations,
  };
  await sync.onRuntimeState("paused", runtime);
  sink.setSources(next);
  await sync.syncSources(runtime, next);
  expect(sink.current()).toEqual({ state: "ready", files: nextDeclarations });
});

test("detaching preview cancels pending results without turning source services off", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const pending = Promise.withResolvers<IntelligenceFile[]>();
  const scan = sync.onRuntimeState("paused", { readTypeScriptDeclarations: () => pending.promise });
  await sync.clear();
  pending.resolve(declarations);
  await scan;
  expect(sink.current()).toEqual({ state: "ready", files: [] });
});

test("missing required packages do not appear as successfully loaded declarations", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  await sync.onRuntimeState("paused", {
    readTypeScriptDeclarations: async () => [
      { path: "package.json", text: '{"dependencies":{"pkg":"1"}}' },
    ],
  });
  expect(sink.current()).toEqual({ state: "unavailable", files: [] });
});

test("does not require unscanned development tooling metadata", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const files = [
    {
      path: "package.json",
      text: '{"dependencies":{"pkg":"1"},"devDependencies":{"vite":"1"}}',
    },
    { path: "node_modules/pkg/package.json", text: "{}" },
    ...declarations,
  ];
  await sync.onRuntimeState("paused", { readTypeScriptDeclarations: async () => files });
  expect(sink.current()).toEqual({ state: "ready", files });
});

test("missing optional packages do not block available project types", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const files = [
    {
      path: "package.json",
      text: '{"dependencies":{"pkg":"1"},"optionalDependencies":{"missing":"1"}}',
    },
    { path: "node_modules/pkg/package.json", text: "{}" },
    ...declarations,
  ];
  await sync.onRuntimeState("paused", { readTypeScriptDeclarations: async () => files });
  expect(sink.current()).toEqual({ state: "ready", files });
});

test("new imports supersede a pending index without restoring its stale import key", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  let reads = 0;
  const runtime = {
    readTypeScriptDeclarations: async () => {
      reads++;
      return declarations;
    },
  };
  await sync.onRuntimeState("paused", runtime);
  const text = 'import "old";\n' + "void Math.random();\n".repeat(1600);
  const pending = sync.syncSources(
    runtime,
    Array.from({ length: 512 }, (_, id) => ({ path: `${id}.ts`, text })),
  );
  const latest = [{ path: "latest.ts", text: 'import "latest";' }];
  sink.setSources(latest);
  await sync.syncSources(runtime, latest);
  await pending;
  await sync.syncSources(runtime, latest);
  expect(reads).toBe(2);
  expect(sink.current()).toEqual({ state: "ready", files: declarations });
});

test("detaching during a yielding import index cannot start another declaration scan", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  let reads = 0;
  const runtime = {
    readTypeScriptDeclarations: async () => {
      reads++;
      return declarations;
    },
  };
  await sync.onRuntimeState("paused", runtime);
  const text = 'import "old";\n' + "void Math.random();\n".repeat(1600);
  const pending = sync.syncSources(
    runtime,
    Array.from({ length: 512 }, (_, id) => ({ path: `${id}.ts`, text })),
  );
  await sync.clear();
  await pending;
  expect(reads).toBe(1);
  expect(sink.current()).toEqual({ state: "ready", files: [] });
});

test("an older refresh cannot cancel the latest runtime scan after its index resumes", async () => {
  const sink = target();
  const sync = new PreviewTypeScriptDeclarations(sink);
  const indexing = Promise.withResolvers<string>();
  const scanStarted = Promise.withResolvers<void>();
  const scan = Promise.withResolvers<IntelligenceFile[]>();
  const imports = spyOn(TypeScriptImportIndex.prototype, "getKey").mockImplementationOnce(
    () => indexing.promise,
  );
  const reads: string[] = [];
  const runtime = {
    readTypeScriptDeclarations: async (sources: readonly IntelligenceFile[] = []) => {
      const path = sources[0].path;
      reads.push(path);
      if (path === "latest.ts") {
        scanStarted.resolve();
        return scan.promise;
      }
      scan.reject(new Error("TypeScript declaration scan cancelled"));
      return [];
    },
  };
  try {
    sink.setSources([{ path: "old.ts", text: 'import "old";' }]);
    const older = sync.onRuntimeState("paused", runtime);
    const latest = [{ path: "latest.ts", text: 'import "latest";' }];
    sink.setSources(latest);
    const newer = sync.syncSources(runtime, latest);
    await scanStarted.promise;
    indexing.resolve('["old"]');
    await older;
    scan.resolve(declarations);
    await newer;
    expect(reads).toEqual(["latest.ts"]);
    expect(sink.current()).toEqual({ state: "ready", files: declarations });
  } finally {
    imports.mockRestore();
  }
});

test.each(["clear", "installing"] as const)(
  "%s invalidates a refresh still waiting for its import index",
  async (action) => {
    const sink = target();
    const sync = new PreviewTypeScriptDeclarations(sink);
    const indexing = Promise.withResolvers<string>();
    const imports = spyOn(TypeScriptImportIndex.prototype, "getKey").mockImplementationOnce(
      () => indexing.promise,
    );
    let reads = 0;
    const runtime = {
      readTypeScriptDeclarations: async () => {
        reads++;
        return declarations;
      },
    };
    try {
      const refresh = sync.onRuntimeState("paused", runtime);
      if (action === "clear") await sync.clear();
      else await sync.onRuntimeState("installing", runtime);
      indexing.resolve("[]");
      await refresh;
      expect(reads).toBe(0);
      expect(sink.current()).toEqual({
        state: action === "clear" ? "ready" : "loading",
        files: [],
      });
    } finally {
      imports.mockRestore();
    }
  },
);
