import { expect, test } from "bun:test";

import type { ProjectFile } from "@iris/shared";

import {
  WebContainerRuntime,
  type RuntimeContainer,
  type RuntimeEvent,
  type RuntimeProcess,
  type RuntimeSettings,
} from "./webcontainer-runtime";

function projectFile(path: string, contents: string): ProjectFile {
  return {
    id: path,
    path,
    language: "javascript",
    kind: "file",
    text: { toString: () => contents } as ProjectFile["text"],
  };
}

function fakeProcess(exitCode = 0): RuntimeProcess {
  return {
    output: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    exit: Promise.resolve(exitCode),
    kill() {},
  };
}

function fakeContainer() {
  const events = new Map<string, (port: number, url: string) => void>();
  const calls = {
    mount: [] as unknown[],
    spawn: [] as string[][],
    writes: [] as string[],
    removes: [] as string[],
  };
  const container: RuntimeContainer = {
    fs: {
      async mkdir() {
        return "";
      },
      async writeFile(path, contents) {
        calls.writes.push(`${path}:${contents}`);
      },
      async rm(path) {
        calls.removes.push(path);
      },
    },
    async mount(tree) {
      calls.mount.push(tree);
    },
    async spawn(command, args) {
      calls.spawn.push([command, ...args]);
      if (args[0] === "run")
        queueMicrotask(() => events.get("server-ready")?.(4173, "http://localhost:4173"));
      return fakeProcess();
    },
    on(event, listener) {
      events.set(event, listener);
      return () => events.delete(event);
    },
    teardown() {},
  };
  return { container, calls };
}

const npmSettings: RuntimeSettings = {
  packageManager: "npm",
  autoInstall: true,
  autoStartPreview: true,
};

test("starts pnpm project and emits ready after server-ready", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];

  await runtime.start(
    [
      projectFile("package.json", '{"scripts":{"dev":"vite"}}'),
      projectFile("src/main.js", "console.log('ok')"),
    ],
    ["src"],
    (event) => events.push(event),
  );

  expect(fake.calls.mount).toHaveLength(1);
  expect(fake.calls.spawn).toEqual([
    ["pnpm", "install", "--reporter=append-only"],
    ["pnpm", "run", "dev"],
  ]);
  expect(events.map((event) => event.type)).toEqual([
    "state",
    "output",
    "state",
    "server-ready",
    "state",
  ]);
  expect(events.at(-1)).toEqual({ type: "state", state: "ready" });
});

test("syncs changed and removed files without remounting", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const packageFile = projectFile("package.json", '{"scripts":{"start":"vite"}}');
  await runtime.start([packageFile, projectFile("src/main.js", "old")], ["src"], () => {});
  await runtime.sync([packageFile, projectFile("src/next.js", "new")], ["src"]);

  expect(fake.calls.mount).toHaveLength(1);
  expect(fake.calls.writes).toContain("/src/next.js:new");
  expect(fake.calls.removes).toContain("/src/main.js");
});

test("reports a missing preview script without spawning a dev server", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];

  await runtime.start([projectFile("package.json", '{"name":"room"}')], [], (event) =>
    events.push(event),
  );

  expect(fake.calls.spawn).toEqual([["pnpm", "install", "--reporter=append-only"]]);
  expect(events.at(-1)).toEqual({ type: "state", state: "error", error: "missing-preview-script" });
});

test("uses the selected package manager for install and preview commands", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });

  await runtime.start(
    [projectFile("package.json", '{"scripts":{"dev":"vite"}}')],
    [],
    () => {},
    npmSettings,
  );

  expect(fake.calls.spawn).toEqual([
    ["npm", "install", "--no-audit", "--no-fund"],
    ["npm", "run", "dev"],
  ]);
});

test("can skip automatic install and preview startup until a manual run", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];
  const settings: RuntimeSettings = {
    packageManager: "pnpm",
    autoInstall: false,
    autoStartPreview: false,
  };
  const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];

  await runtime.start(files, [], (event) => events.push(event), settings);
  expect(fake.calls.spawn).toEqual([]);
  expect(events.at(-1)).toEqual({ type: "state", state: "paused" });

  await runtime.restart(files, [], () => {}, settings, { forceStart: true });
  expect(fake.calls.spawn).toEqual([["pnpm", "run", "dev"]]);
});
