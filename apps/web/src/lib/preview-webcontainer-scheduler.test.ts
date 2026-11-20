import { expect, test } from "bun:test";
import { PreviewContentChanges } from "./preview-content-changes";
import { projectFile } from "./webcontainer-test-utils";
import type { RuntimeEvent } from "./webcontainer-runtime";
import {
  PreviewWebContainerScheduler,
  type PreviewRuntimePort,
  type PreviewRuntimeInput,
} from "./preview-webcontainer-scheduler";

const completedStart = () => Promise.resolve();
const unchangedSync = () => Promise.resolve({ packageChanged: false });

function fixture(
  options: {
    runtimeFactory?: (
      runtime: PreviewRuntimePort,
    ) => Promise<PreviewRuntimePort>;
    debounceMs?: number;
  } = {},
) {
  const changes = new PreviewContentChanges();
  const app = projectFile("app.ts", "const value = 1;");
  const files = [
    projectFile("package.json", '{"scripts":{"dev":"vite"}}'),
    app,
  ];
  const calls: Array<{ command: string; paths: string[]; options?: unknown }> =
    [];
  const listeners: Array<(event: RuntimeEvent) => void> = [];
  const completed: string[] = [];
  let start = completedStart;
  let sync = unchangedSync;
  let disposed = 0;
  const runtime: PreviewRuntimePort = {
    async start(current, _folders, listener, _settings, startOptions) {
      calls.push({
        command: "start",
        paths: current.map(({ path }) => path),
        options: startOptions,
      });
      listeners.push(listener);
      await start();
    },
    async restart(current, _folders, listener, _settings, startOptions) {
      calls.push({
        command: "restart",
        paths: current.map(({ path }) => path),
        options: startOptions,
      });
      listeners.push(listener);
      await start();
    },
    async sync(current) {
      calls.push({ command: "sync", paths: current.map(({ path }) => path) });
      return sync();
    },
    async syncChangedFiles(current) {
      calls.push({
        command: "sync-changed",
        paths: current.map(({ path }) => path),
      });
      return sync();
    },
    async readTypeScriptDeclarations() {
      return [];
    },
    dispose() {
      disposed++;
    },
  };
  const scheduler = new PreviewWebContainerScheduler({
    createRuntime: () =>
      options.runtimeFactory?.(runtime) ?? Promise.resolve(runtime),
    loadSyntaxValidator: async () => (source) =>
      source === "invalid"
        ? {
            message: "Syntax error",
            location: { line: 1, column: 1, offset: 0 },
          }
        : undefined,
    completeAction: (action) => completed.push(action),
    debounceMs: options.debounceMs ?? 1,
  });
  const input: PreviewRuntimeInput = {
    enabled: true,
    file: app,
    files,
    folders: [],
    settings: {
      packageManager: "pnpm",
      autoInstall: true,
      autoStartPreview: true,
    },
    runKey: 0,
    acknowledgeContentChanges: (pending) => changes.acknowledge(pending),
    getPendingContentChanges: () => changes.pending(),
    translateError: (error) => `translated ${error}`,
  };
  return {
    scheduler,
    runtime,
    input,
    changes,
    calls,
    listeners,
    completed,
    setStart: (next: typeof start) => (start = next),
    setSync: (next: typeof sync) => (sync = next),
    disposed: () => disposed,
  };
}

const settle = () => Bun.sleep(15);

test("debounces rapid edits and syncs only their latest pending revision", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  const baseline = f.calls.length;
  f.changes.record(f.input.file);
  f.scheduler.update(f.input);
  f.changes.record(f.input.file);
  f.scheduler.update(f.input);
  await settle();
  expect(f.calls.slice(baseline)).toEqual([
    { command: "sync-changed", paths: ["app.ts"] },
  ]);
  expect(f.changes.pending()).toEqual([]);
  f.scheduler.dispose();
});

test("a manual run restarts during installation and ignores the abandoned completion", async () => {
  const f = fixture();
  const installing = Promise.withResolvers<void>();
  f.setStart(() => installing.promise);
  f.scheduler.update(f.input);
  await settle();
  f.listeners[0]?.({ type: "state", state: "installing" });
  f.setStart(() => Promise.resolve());
  f.scheduler.update({ ...f.input, runKey: 1 });
  await settle();
  f.listeners[1]?.({ type: "state", state: "paused" });
  const calls = f.calls.slice();
  installing.resolve();
  await settle();
  expect(f.calls).toEqual(calls);
  expect(calls.map(({ command }) => command)).toEqual(["start", "restart"]);
  expect(f.scheduler.getSnapshot().runtimeState).toBe("paused");
  f.scheduler.dispose();
});

test("package changes request a preflight restart after the completed write", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  f.setSync(async () => ({ packageChanged: true }));
  f.changes.record(f.input.files[0]!);
  f.scheduler.update(f.input);
  await settle();
  expect(f.calls.slice(-2)).toEqual([
    { command: "sync-changed", paths: ["package.json"] },
    {
      command: "restart",
      paths: ["package.json", "app.ts"],
      options: { forceStart: false },
    },
  ]);
  f.scheduler.dispose();
});

test("manual reinstall forces installation and signals completion even on failure", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  f.setStart(async () => {
    throw new Error("install failed");
  });
  f.scheduler.requestAction("reinstall");
  f.scheduler.update({ ...f.input, runKey: 1 });
  await settle();
  expect(f.calls.at(-1)).toEqual({
    command: "restart",
    paths: ["package.json", "app.ts"],
    options: { forceStart: true, forceInstall: true },
  });
  expect(f.completed).toEqual(["reinstall"]);
  expect(f.scheduler.getSnapshot().buildError).toBe("install failed");
  f.scheduler.dispose();
});

test("syntax preflight preserves pending changes and blocks late ready events until repaired", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  f.input.file.text.toString = () => "invalid";
  f.changes.record(f.input.file);
  f.scheduler.update(f.input);
  await settle();
  const calls = f.calls.length;
  f.listeners[0]?.({ type: "server-ready", port: 1, url: "http://obsolete" });
  expect(f.scheduler.getSnapshot().sourceError?.path).toBe("app.ts");
  expect(f.scheduler.getSnapshot().previewUrl).toBeUndefined();
  expect(f.changes.pending()).toHaveLength(1);
  f.input.file.text.toString = () => "const value = 2;";
  f.scheduler.update(f.input);
  await settle();
  expect(f.calls.length).toBe(calls + 1);
  expect(f.scheduler.getSnapshot().sourceError).toBeUndefined();
  expect(f.changes.pending()).toEqual([]);
  f.scheduler.dispose();
});

test("disposal cancels debounce and ignores ready, output and rejected work from the old runtime", async () => {
  const f = fixture();
  const installing = Promise.withResolvers<void>();
  f.setStart(() => installing.promise);
  f.scheduler.update(f.input);
  await settle();
  f.scheduler.dispose();
  f.listeners[0]?.({ type: "server-ready", port: 1, url: "http://obsolete" });
  f.listeners[0]?.({ type: "output", level: "error", message: "obsolete" });
  installing.reject(new Error("obsolete failure"));
  await settle();
  expect(f.disposed()).toBe(1);
  expect(f.scheduler.getSnapshot()).toMatchObject({
    runtimeState: "idle",
    outputs: [],
  });
  expect(f.scheduler.getSnapshot().previewUrl).toBeUndefined();
  expect(f.scheduler.getSnapshot().buildError).toBeUndefined();
  f.scheduler.update(f.input);
  f.scheduler.dispose();
  await settle();
  expect(f.calls).toHaveLength(1);
});

test("old server-ready and failure callbacks cannot replace a restarted generation", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  f.scheduler.update({ ...f.input, runKey: 1 });
  await settle();
  f.listeners[1]?.({ type: "server-ready", port: 2, url: "http://current" });
  f.listeners[1]?.({ type: "state", state: "ready" });
  f.listeners[0]?.({ type: "server-ready", port: 1, url: "http://obsolete" });
  f.listeners[0]?.({ type: "state", state: "error", error: "start-failed" });
  expect(f.scheduler.getSnapshot()).toMatchObject({
    previewUrl: "http://current",
    runtimeState: "ready",
    runtimeError: undefined,
  });
  f.scheduler.dispose();
});

test("an older sync rejection preserves a newer syntax error", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  const pending = Promise.withResolvers<{ packageChanged: boolean }>();
  f.setSync(() => pending.promise);
  f.changes.record(f.input.file);
  f.scheduler.update(f.input);
  await settle();
  expect(f.calls.at(-1)?.command).toBe("sync-changed");

  f.input.file.text.toString = () => "invalid";
  f.changes.record(f.input.file);
  f.scheduler.update(f.input);
  await settle();
  expect(f.scheduler.getSnapshot().buildError).toBe("Syntax error");
  pending.reject(new Error("older sync failed"));
  await settle();
  expect(f.scheduler.getSnapshot().buildError).toBe("Syntax error");
  expect(f.scheduler.getSnapshot().sourceError?.source).toBe("invalid");
  expect(f.scheduler.getSnapshot().outputs).toEqual([
    { level: "error", message: "Syntax error" },
  ]);
  f.scheduler.dispose();
});

test("runtime output stays bounded and iframe errors are deduplicated", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  for (let index = 0; index < 100; index++) {
    f.listeners[0]?.({ type: "output", level: "log", message: String(index) });
  }
  expect(f.scheduler.getSnapshot().outputs).toHaveLength(80);
  expect(f.scheduler.getSnapshot().outputs[0]?.message).toBe("20");
  f.scheduler.reportIframeError("frame failed");
  f.scheduler.reportIframeError("frame failed");
  expect(
    f.scheduler
      .getSnapshot()
      .outputs.filter(({ message }) => message === "frame failed"),
  ).toHaveLength(1);
  expect(f.scheduler.getSnapshot().runtimeState).toBe("error");
  f.scheduler.dispose();
});

test("settings and translation refreshes preserve the current run without restarting unrelated settings", async () => {
  const f = fixture();
  f.scheduler.update(f.input);
  await settle();
  const commands = f.calls.slice();
  f.scheduler.update({
    ...f.input,
    settings: { ...f.input.settings },
    translateError: (error) => `new translation: ${error}`,
  });
  await settle();
  f.listeners[0]?.({ type: "server-ready", port: 1, url: "http://current" });
  f.listeners[0]?.({ type: "state", state: "error", error: "start-failed" });
  expect(f.calls).toEqual(commands);
  expect(f.scheduler.getSnapshot().buildError).toBe(
    "new translation: start-failed",
  );
  f.scheduler.update({
    ...f.input,
    settings: { ...f.input.settings, autoInstall: false },
  });
  await settle();
  expect(f.calls.at(-1)?.command).toBe("restart");
  f.scheduler.dispose();
});

test("unmount during debounce never starts the runtime", async () => {
  const f = fixture({ debounceMs: 30 });
  f.scheduler.update(f.input);
  await Bun.sleep(2);
  f.scheduler.dispose();
  await Bun.sleep(40);
  expect(f.calls).toEqual([]);
  expect(f.disposed()).toBe(1);
});

test("StrictMode dispose and remount reject a late runtime load without disposing its replacement", async () => {
  const old = fixture();
  const pending = Promise.withResolvers<PreviewRuntimePort>();
  let loads = 0;
  const f = fixture({
    runtimeFactory: (runtime) =>
      ++loads === 1 ? pending.promise : Promise.resolve(runtime),
  });
  f.scheduler.update(f.input);
  f.scheduler.dispose();
  f.scheduler.update(f.input);
  await settle();
  pending.resolve(old.runtime);
  await settle();
  expect(old.disposed()).toBe(1);
  expect(old.calls).toEqual([]);
  expect(f.disposed()).toBe(0);
  expect(f.calls.map(({ command }) => command)).toEqual(["start", "sync"]);
  f.listeners[0]?.({
    type: "server-ready",
    port: 1,
    url: "http://replacement",
  });
  expect(f.scheduler.getSnapshot().previewUrl).toBe("http://replacement");
  f.scheduler.dispose();
});
