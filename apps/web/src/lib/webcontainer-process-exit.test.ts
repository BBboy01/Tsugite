import { expect, test } from "bun:test";
import { WebContainerRuntime, type RuntimeEvent } from "./webcontainer-runtime";
import { fakeContainer, projectFile } from "./webcontainer-test-utils";

const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];

for (const outcome of [0, 1, "rejected"] as const) {
  test(`reports a ready preview ending with ${outcome} and can restart`, async () => {
    const fake = fakeContainer();
    const spawn = fake.container.spawn;
    const exit = Promise.withResolvers<number>();
    let previews = 0;
    fake.container.spawn = async (command, args) => {
      const process = await spawn(command, args);
      return args[0] === "run" && ++previews === 1 ? { ...process, exit: exit.promise } : process;
    };
    const runtime = new WebContainerRuntime({ boot: async () => fake.container });
    const events: RuntimeEvent[] = [];
    const listener = (event: RuntimeEvent) => events.push(event);
    try {
      await runtime.start(files, [], listener);
      expect(events.at(-1)).toEqual({ type: "state", state: "ready" });
      if (outcome === "rejected") exit.reject(new Error("process connection lost"));
      else exit.resolve(outcome);
      await exit.promise.catch(() => {});
      expect(events.at(-1)).toEqual({
        type: "state",
        state: "error",
        error: outcome === "rejected" ? "runtime-unavailable" : "server-exited",
      });
      const failedEvents = events.slice();
      fake.emitReady();
      fake.emitError(new Error("stale error"));
      expect(events).toEqual(failedEvents);
      await runtime.restart(files, [], listener);
      expect(events.at(-1)).toEqual({ type: "state", state: "ready" });
    } finally {
      runtime.dispose();
    }
  });
}

for (const action of ["restart", "dispose"] as const) {
  for (const outcome of ["exit", "rejection"] as const) {
    test(`ignores a previous preview's ${outcome} after ${action}`, async () => {
      const fake = fakeContainer();
      const spawn = fake.container.spawn;
      const exit = Promise.withResolvers<number>();
      let previews = 0;
      fake.container.spawn = async (command, args) => {
        const process = await spawn(command, args);
        return args[0] === "run" && ++previews === 1 ? { ...process, exit: exit.promise } : process;
      };
      const runtime = new WebContainerRuntime({ boot: async () => fake.container });
      const events: RuntimeEvent[] = [];
      const listener = (event: RuntimeEvent) => events.push(event);
      try {
        await runtime.start(files, [], listener);
        if (action === "restart") await runtime.restart(files, [], listener);
        else runtime.dispose();
        const settledEvents = events.slice();
        if (outcome === "rejection") exit.reject(new Error("obsolete process connection lost"));
        else exit.resolve(1);
        await exit.promise.catch(() => {});
        expect(events).toEqual(settledEvents);
        expect(events.at(-1)).toEqual({ type: "state", state: "ready" });
      } finally {
        runtime.dispose();
      }
    });
  }
}
