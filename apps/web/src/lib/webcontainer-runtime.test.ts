import { expect, test } from "bun:test";

import {
  WebContainerRuntime,
  getRuntimeError,
  isStoragePartitioningErrorUrl,
  type RuntimeEvent,
  type RuntimeProcess,
  type RuntimeSettings,
} from "./webcontainer-runtime";
import { fakeContainer, fakeProcess, projectFile } from "./webcontainer-test-utils";

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
      projectFile("package.json", '{"scripts":{"dev":"vite"},"devDependencies":{"vite":"latest"}}'),
      projectFile("src/main.js", "console.log('ok')"),
    ],
    ["src"],
    (event) => events.push(event),
  );

  expect(fake.calls.mount).toHaveLength(1);
  expect(fake.calls.mount[0]).toMatchObject({
    "package.json": {
      file: {
        contents: expect.stringContaining('"pnpm"'),
      },
    },
    "pnpm-workspace.yaml": {
      file: { contents: "packages:\n  - .\noverrides:\n  rolldown@1.2.9: 1.2.8\n" },
    },
  });
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

test("reports install failure and terminates an installation that exceeds its deadline", async () => {
  const fake = fakeContainer();
  let killed = false;
  const install = {
    ...fakeProcess(),
    exit: new Promise<number>(() => {}),
    kill() {
      killed = true;
    },
  };
  fake.container.spawn = async () => install;
  const runtime = new WebContainerRuntime({
    boot: async () => fake.container,
    installTimeoutMs: 10,
  });
  const events: RuntimeEvent[] = [];
  await runtime.start([projectFile("package.json", '{"scripts":{"dev":"vite"}}')], [], (event) =>
    events.push(event),
  );
  expect(killed).toBe(true);
  expect(events.at(-1)).toEqual({ type: "state", state: "error", error: "install-failed" });
  runtime.dispose();
}, 1000);

test("disposes an in-flight dependency install instead of leaving it running", async () => {
  const fake = fakeContainer();
  let resolveInstall: ((code: number) => void) | undefined;
  let killed = false;
  fake.container.spawn = async (_command, args) => {
    if (args[0] !== "install") return fakeProcess();
    return {
      ...fakeProcess(),
      exit: new Promise<number>((resolve) => {
        resolveInstall = resolve;
      }),
      kill() {
        killed = true;
        resolveInstall?.(1);
      },
    };
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const started = runtime.start(
    [projectFile("package.json", '{"scripts":{"dev":"vite"}}')],
    [],
    () => {},
  );

  await Bun.sleep(20);
  runtime.dispose();
  await started;

  expect(killed).toBe(true);
  expect(fake.calls.teardown).toBe(1);
}, 1000);

test("restarting during installation cancels the old generation before starting again", async () => {
  const fake = fakeContainer();
  const originalSpawn = fake.container.spawn;
  let installCount = 0;
  let killed = false;
  let resolveFirstInstall: ((code: number) => void) | undefined;
  fake.container.spawn = async (command, args) => {
    if (args[0] !== "install") return originalSpawn(command, args);
    installCount += 1;
    if (installCount > 1) return fakeProcess();
    return {
      ...fakeProcess(),
      exit: new Promise<number>((resolve) => {
        resolveFirstInstall = resolve;
      }),
      kill() {
        killed = true;
        resolveFirstInstall?.(1);
      },
    };
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];
  const firstStart = runtime.start(files, [], () => {});

  await Bun.sleep(20);
  await runtime.restart(files, [], () => {});
  await firstStart;

  expect(killed).toBe(true);
  expect(installCount).toBe(2);
  expect(fake.calls.spawn.filter((call) => call[1] === "run")).toHaveLength(1);
  runtime.dispose();
}, 1000);

test("does not adopt an install process that appears after disposal", async () => {
  const fake = fakeContainer();
  const spawnStarted = Promise.withResolvers<void>();
  let resolveSpawn: ((process: RuntimeProcess) => void) | undefined;
  let killed = false;
  fake.container.spawn = async (_command, args) => {
    if (args[0] !== "install") return fakeProcess();
    spawnStarted.resolve();
    return new Promise<RuntimeProcess>((resolve) => {
      resolveSpawn = resolve;
    });
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const started = runtime.start(
    [projectFile("package.json", '{"scripts":{"dev":"vite"}}')],
    [],
    () => {},
  );

  await spawnStarted.promise;
  runtime.dispose();
  resolveSpawn?.({
    ...fakeProcess(1),
    kill() {
      killed = true;
    },
  });
  await started;

  expect(killed).toBe(true);
}, 1000);

test("waits for installation to finish before starting the preview", async () => {
  const fake = fakeContainer();
  const originalSpawn = fake.container.spawn;
  let finish: ((code: number) => void) | undefined;
  let installing = false;
  fake.container.spawn = async (command, args) => {
    if (args[0] !== "install") return originalSpawn(command, args);
    installing = true;
    return {
      ...fakeProcess(),
      exit: new Promise<number>((resolve) => {
        finish = resolve;
      }),
    };
  };
  const runtime = new WebContainerRuntime({
    boot: async () => fake.container,
    installTimeoutMs: 100,
  });
  const events: RuntimeEvent[] = [];
  const started = runtime.start(
    [projectFile("package.json", '{"scripts":{"dev":"vite"}}')],
    [],
    (event) => events.push(event),
  );
  await Bun.sleep(20);
  expect(installing).toBe(true);
  expect(events.some((event) => event.type === "server-ready")).toBe(false);
  finish!(0);
  await started;
  expect(events.at(-1)).toEqual({ type: "state", state: "ready" });
  runtime.dispose();
});

test("forwards preview errors that occur after the server is ready", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];

  await runtime.start([projectFile("package.json", '{"scripts":{"dev":"vite"}}')], [], (event) =>
    events.push(event),
  );
  fake.emitError(new Error("Unexpected token"));

  expect(events.at(-2)).toEqual({ type: "output", level: "error", message: "Unexpected token" });
  expect(events.at(-1)).toEqual({ type: "state", state: "error", error: "start-failed" });
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

test("restarts the preview process without tearing down the WebContainer", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];

  await runtime.start(files, [], () => {}, npmSettings);
  await runtime.restart(files, [], () => {}, npmSettings);

  expect(fake.calls.mount).toHaveLength(2);
  expect(fake.calls.spawn).toHaveLength(4);
  expect(fake.calls.teardown).toBe(0);
});

test("recognizes storage partitioning failures from WebContainer", () => {
  expect(getRuntimeError(new Error("Enable Storage Partitioning to run this preview"))).toBe(
    "storage-partitioning-required",
  );
  expect(getRuntimeError({ message: "Enable Storage Partitioning to run this preview" })).toBe(
    "storage-partitioning-required",
  );
  expect(
    isStoragePartitioningErrorUrl(
      "https://project.local-corp.webcontainer-api.io/.localservice@sw-install-error.abc.html",
    ),
  ).toBe(true);
  expect(isStoragePartitioningErrorUrl("https://project.local-corp.webcontainer-api.io/")).toBe(
    false,
  );
});

test("stops preview startup when the server-ready URL is a storage error page", async () => {
  const fake = fakeContainer(
    "https://project.local-corp.webcontainer-api.io/.localservice@sw-install-error.abc.html",
  );
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];

  await runtime.start([projectFile("package.json", '{"scripts":{"dev":"vite"}}')], [], (event) =>
    events.push(event),
  );

  expect(events).toContainEqual({
    type: "state",
    state: "error",
    error: "storage-partitioning-required",
  });
  expect(events.some((event) => event.type === "server-ready")).toBe(false);
});
