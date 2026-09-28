import { expect, test } from "bun:test";

import {
  WebContainerRuntime,
  type RuntimeContainer,
  type RuntimeEvent,
  type RuntimeProcess,
} from "./webcontainer-runtime";
import { fakeContainer, fakeProcess, projectFile } from "./webcontainer-test-utils";

const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];

test("tears down an abandoned boot once without replacing the current container", async () => {
  const old = fakeContainer();
  const current = fakeContainer();
  const pendingBoot = Promise.withResolvers<RuntimeContainer>();
  let boots = 0;
  const runtime = new WebContainerRuntime({
    boot: () => (++boots === 1 ? pendingBoot.promise : Promise.resolve(current.container)),
  });
  const first = runtime.start(files, [], () => {});
  const second = runtime.restart(files, [], () => {});
  runtime.dispose();
  await runtime.start(files, [], () => {});

  pendingBoot.resolve(old.container);
  await Promise.all([first, second]);
  await runtime.sync([...files, projectFile("current.js", "current")], []);

  expect(boots).toBe(2);
  expect(old.calls.teardown).toBe(1);
  expect(old.calls.mount).toHaveLength(0);
  expect(old.calls.writes).toEqual([]);
  expect(current.calls.writes).toContain("/current.js:current");
  runtime.dispose();
  expect(current.calls.teardown).toBe(1);
});

test("an abandoned boot rejection does not clear a newer pending boot", async () => {
  const fake = fakeContainer();
  const abandonedBoot = Promise.withResolvers<RuntimeContainer>();
  const pendingBoot = Promise.withResolvers<RuntimeContainer>();
  let boots = 0;
  const runtime = new WebContainerRuntime({
    boot: () => (++boots === 1 ? abandonedBoot.promise : pendingBoot.promise),
  });
  const first = runtime.start(files, [], () => {});
  runtime.dispose();
  const second = runtime.start(files, [], () => {});
  abandonedBoot.reject(new Error("old boot failed"));
  await first;
  const third = runtime.restart(files, [], () => {});
  pendingBoot.resolve(fake.container);
  await Promise.all([second, third]);

  expect(boots).toBe(2);
  expect(fake.calls.mount).toHaveLength(1);
  runtime.dispose();
});

test("a mount finishing after disposal cannot spawn processes or publish more events", async () => {
  const fake = fakeContainer();
  const mounting = Promise.withResolvers<void>();
  const mounted = Promise.withResolvers<void>();
  fake.container.mount = () => {
    mounting.resolve();
    return mounted.promise;
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const events: RuntimeEvent[] = [];
  const start = runtime.start(files, [], (event) => events.push(event));
  await mounting.promise;
  runtime.dispose();
  mounted.resolve();
  await start;

  expect(fake.calls.spawn).toEqual([]);
  expect(events).toEqual([{ type: "state", state: "installing" }]);
});

test("a previous generation's output cannot pollute the restarted preview", async () => {
  const fake = fakeContainer();
  const spawn = fake.container.spawn;
  const oldOutput = new TransformStream<string, string>();
  const writer = oldOutput.writable.getWriter();
  let previews = 0;
  fake.container.spawn = async (command, args) => {
    const process = await spawn(command, args);
    if (args[0] !== "run" || ++previews !== 1) return process;
    return { ...process, output: oldOutput.readable };
  };
  const events: RuntimeEvent[] = [];
  const listener = (event: RuntimeEvent) => events.push(event);
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(files, [], listener);
  await writer.write("initial output");
  await runtime.restart(files, [], listener);
  await writer.write("obsolete output");
  await writer.close();

  expect(events).toContainEqual({ type: "output", level: "log", message: "initial output" });
  expect(events).not.toContainEqual({ type: "output", level: "log", message: "obsolete output" });
  runtime.dispose();
});

for (const autoInstall of [true, false]) {
  test(`kills a late ${autoInstall ? "install" : "preview"} process after spawn times out`, async () => {
    const fake = fakeContainer();
    const pendingSpawn = Promise.withResolvers<RuntimeProcess>();
    const killed = Promise.withResolvers<void>();
    fake.container.spawn = () => pendingSpawn.promise;
    const runtime = new WebContainerRuntime({
      boot: async () => fake.container,
      spawnTimeoutMs: 10,
    });
    const events: RuntimeEvent[] = [];
    await runtime.start(files, [], (event) => events.push(event), {
      packageManager: "pnpm",
      autoInstall,
      autoStartPreview: true,
    });
    const settledEvents = events.slice();
    pendingSpawn.resolve({ ...fakeProcess(), kill: () => killed.resolve() });
    await killed.promise;

    expect(events).toEqual(settledEvents);
    expect(events.at(-1)).toEqual({
      type: "state",
      state: "error",
      error: autoInstall ? "install-failed" : "start-failed",
    });
    runtime.dispose();
  }, 1000);
}

test("kills a preview process returned after disposal", async () => {
  const fake = fakeContainer();
  const spawning = Promise.withResolvers<void>();
  const pendingSpawn = Promise.withResolvers<RuntimeProcess>();
  let killed = false;
  fake.container.spawn = () => {
    spawning.resolve();
    return pendingSpawn.promise;
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const start = runtime.start(files, [], () => {}, {
    packageManager: "pnpm",
    autoInstall: false,
    autoStartPreview: true,
  });
  await spawning.promise;
  runtime.dispose();
  pendingSpawn.resolve({
    ...fakeProcess(),
    kill: () => {
      killed = true;
    },
  });
  await start;

  expect(killed).toBe(true);
});

test("reports output stream failures without an unhandled rejection or failing the ready preview", async () => {
  const fake = fakeContainer();
  const spawn = fake.container.spawn;
  fake.container.spawn = async (command, args) => {
    const process = await spawn(command, args);
    if (args[0] !== "run") return process;
    return {
      ...process,
      output: new ReadableStream<string>({
        start(controller) {
          controller.error(new Error("stream disconnected"));
        },
      }),
    };
  };
  const events: RuntimeEvent[] = [];
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(files, [], (event) => events.push(event));

  expect(events).toContainEqual({
    type: "output",
    level: "warn",
    message: "stream disconnected",
  });
  expect(events).toContainEqual({ type: "state", state: "ready" });
  expect(events.some((event) => event.type === "state" && event.state === "error")).toBe(false);
  runtime.dispose();
});

for (const failure of ["spawn", "early exit"]) {
  test(`a late ready event cannot revive a preview after ${failure} failure`, async () => {
    const fake = fakeContainer();
    fake.container.spawn = async () => {
      if (failure === "spawn") throw new Error("start-failed");
      return fakeProcess(1);
    };
    const runtime = new WebContainerRuntime({ boot: async () => fake.container });
    const events: RuntimeEvent[] = [];
    await runtime.start(files, [], (event) => events.push(event), {
      packageManager: "pnpm",
      autoInstall: false,
      autoStartPreview: true,
    });
    const failedEvents = events.slice();
    expect(events.at(-1)).toEqual({ type: "state", state: "error", error: "start-failed" });
    fake.emitReady();
    fake.emitError(new Error("obsolete preview error"));

    expect(events).toEqual(failedEvents);
    runtime.dispose();
  });
}
