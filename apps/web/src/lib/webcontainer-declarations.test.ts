import { expect, test } from "bun:test";
import { WebContainerRuntime } from "./webcontainer-runtime";
import { fakeContainer, projectFile } from "./webcontainer-test-utils";
import type { RuntimeProcess } from "./webcontainer-runtime";

const pausedSettings = {
  packageManager: "npm",
  autoInstall: false,
  autoStartPreview: false,
} as const;

async function startedRuntime(
  options: { declarationTimeoutMs?: number; spawnTimeoutMs?: number } = {},
) {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container, ...options });
  await runtime.start([projectFile("package.json", "{}")], [], () => {}, pausedSettings);
  return { fake, runtime };
}

function outputProcess(output: string, code = 0): RuntimeProcess {
  return {
    output: new ReadableStream({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    }),
    exit: Promise.resolve(code),
    kill() {},
  };
}

test("reads declaration scan output from a fixed node process after runtime startup", async () => {
  const fake = fakeContainer();
  fake.container.spawn = async (command, args) => {
    if (command === "node") {
      expect(args).toHaveLength(2);
      expect(args[0]).toBe("-e");
      return {
        output: new ReadableStream<string>({
          start(controller) {
            controller.enqueue(
              JSON.stringify({
                status: "ok",
                files: [{ path: "node_modules/@types/react/index.d.ts", text: "export {};" }],
              }),
            );
            controller.close();
          },
        }),
        exit: Promise.resolve(0),
        kill() {},
      };
    }
    return {
      output: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      exit: Promise.resolve(0),
      kill() {},
    };
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start([projectFile("package.json", '{"scripts":{"dev":"vite"}}')], [], () => {}, {
    packageManager: "npm",
    autoInstall: false,
    autoStartPreview: false,
  });

  await expect(runtime.readTypeScriptDeclarations()).resolves.toEqual([
    { path: "node_modules/@types/react/index.d.ts", text: "export {};" },
  ]);
  runtime.dispose();
});

test("does not boot a container solely for a declaration request", async () => {
  let booted = false;
  const runtime = new WebContainerRuntime({
    boot: async () => {
      booted = true;
      return fakeContainer().container;
    },
  });
  await expect(runtime.readTypeScriptDeclarations()).rejects.toThrow("unavailable");
  expect(booted).toBe(false);
});

test("keeps source content out of the fixed scanner script", async () => {
  const { fake, runtime } = await startedRuntime();
  const source = { path: "src/App.ts", text: 'import "new-package"; /* unique-source-text */' };
  fake.container.spawn = async (_command, args) => {
    expect(args[1]).not.toContain("unique-source-text");
    expect(JSON.parse(Buffer.from(args[2]!, "base64").toString("utf8"))).toEqual([source]);
    return outputProcess('{"status":"ok","files":[]}');
  };
  await expect(runtime.readTypeScriptDeclarations([source])).resolves.toEqual([]);
  runtime.dispose();
});

test("rejects aggregate source requests beyond the workspace byte budget before spawning", async () => {
  const { fake, runtime } = await startedRuntime();
  let spawned = false;
  fake.container.spawn = async () => {
    spawned = true;
    return outputProcess('{"status":"ok","files":[]}');
  };
  await expect(
    runtime.readTypeScriptDeclarations(
      Array.from({ length: 17 }, (_, index) => ({
        path: `src/${index}.ts`,
        text: "x".repeat(1024 * 1024),
      })),
    ),
  ).rejects.toThrow("source request limit");
  expect(spawned).toBe(false);
  runtime.dispose();
});

test("a newer declaration scan cancels the pending scan before spawning", async () => {
  const { fake, runtime } = await startedRuntime();
  const firstSpawned = Promise.withResolvers<void>();
  const secondSpawned = Promise.withResolvers<void>();
  let spawnCount = 0;
  let activeProcesses = 0;
  let peakActiveProcesses = 0;
  let firstKilled = false;

  const processFor = (output?: string): RuntimeProcess => {
    activeProcesses += 1;
    peakActiveProcesses = Math.max(peakActiveProcesses, activeProcesses);
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      activeProcesses -= 1;
    };
    if (output === undefined) {
      return {
        output: new ReadableStream(),
        exit: new Promise(() => {}),
        kill: release,
      };
    }
    const process = outputProcess(output);
    return { ...process, exit: process.exit.finally(release), kill: release };
  };

  fake.container.spawn = async () => {
    spawnCount += 1;
    if (spawnCount === 1) {
      firstSpawned.resolve();
      const process = processFor();
      return {
        ...process,
        kill() {
          firstKilled = true;
          process.kill();
        },
      };
    }
    secondSpawned.resolve();
    return processFor('{"status":"ok","files":[]}');
  };

  const firstScan = runtime.readTypeScriptDeclarations();
  const firstResult = firstScan.then(
    () => undefined,
    (error: Error) => error,
  );
  await firstSpawned.promise;
  await Bun.sleep(0);

  const secondScan = runtime.readTypeScriptDeclarations();
  await secondSpawned.promise;
  await Bun.sleep(0);
  const firstWasKilledBeforeSecondSpawn = firstKilled;
  const peakWhileScansOverlapped = peakActiveProcesses;
  await expect(secondScan).resolves.toEqual([]);

  runtime.dispose();
  expect(((await firstResult) as Error).message).toContain("cancelled");
  expect(firstWasKilledBeforeSecondSpawn).toBe(true);
  expect(peakWhileScansOverlapped).toBe(1);
});

test("kills in-flight scans on disposal and rejects stale output", async () => {
  const { fake, runtime } = await startedRuntime();
  let killed = false;
  const spawned = Promise.withResolvers<void>();
  fake.container.spawn = async () => {
    spawned.resolve();
    return {
      output: new ReadableStream(),
      exit: new Promise(() => {}),
      kill() {
        killed = true;
      },
    };
  };
  const scan = runtime.readTypeScriptDeclarations();
  const rejected = scan.catch((error: Error) => error);
  await spawned.promise;
  await Bun.sleep(0);
  runtime.dispose();
  expect(await rejected).toBeInstanceOf(Error);
  expect(((await rejected) as Error).message).toContain("cancelled");
  expect(killed).toBe(true);
});

test("kills a scanner whose spawn resolves after cancellation", async () => {
  const { fake, runtime } = await startedRuntime();
  const spawn = Promise.withResolvers<RuntimeProcess>();
  fake.container.spawn = () => spawn.promise;
  const request = runtime.readTypeScriptDeclarations();
  const rejected = request.catch((error: Error) => error);
  runtime.dispose();
  expect(((await rejected) as Error).message).toContain("cancelled");
  let killed = false;
  spawn.resolve({
    ...outputProcess('{"status":"ok","files":[]}'),
    kill() {
      killed = true;
    },
  });
  await Bun.sleep(0);
  expect(killed).toBe(true);
});

test("bounds hung spawn, exit, and output independently and terminates the scan", async () => {
  for (const phase of ["spawn", "exit", "output"]) {
    const { fake, runtime } = await startedRuntime({
      declarationTimeoutMs: 10,
      spawnTimeoutMs: 10,
    });
    let killed = false;
    let finishSpawn: ((process: RuntimeProcess) => void) | undefined;
    const process = {
      ...outputProcess('{"status":"ok","files":[]}'),
      kill() {
        killed = true;
      },
    };
    if (phase === "exit") process.exit = new Promise(() => {});
    if (phase === "output") process.output = new ReadableStream();
    fake.container.spawn = () =>
      phase === "spawn"
        ? new Promise((resolve) => {
            finishSpawn = resolve;
          })
        : Promise.resolve(process);
    await expect(runtime.readTypeScriptDeclarations()).rejects.toThrow("timed out");
    finishSpawn?.(process);
    await Bun.sleep(0);
    expect(killed).toBe(true);
    runtime.dispose();
  }
}, 1000);

test("rejects failed processes, disabled results, and stream output above its hard budget", async () => {
  for (const [output, exit, reason] of [
    ['{"status":"ok","files":[]}', 1, "exit"],
    ['{"status":"disabled","reason":"budget exceeded"}', 0, "budget exceeded"],
    ["x".repeat(16 * 1024 * 1024 + 1), 0, "output limit"],
  ] as const) {
    const { fake, runtime } = await startedRuntime();
    let killed = false;
    fake.container.spawn = async () => ({
      ...outputProcess(output, exit),
      kill() {
        killed = true;
      },
    });
    await expect(runtime.readTypeScriptDeclarations()).rejects.toThrow(reason);
    expect(killed).toBe(true);
    runtime.dispose();
  }
});

test("restart cancels scan ownership without killing the live preview during a successful scan", async () => {
  const fake = fakeContainer();
  let previewKilled = false;
  const originalSpawn = fake.container.spawn;
  fake.container.spawn = async (command, args) => {
    if (command === "node") return outputProcess('{"status":"ok","files":[]}');
    const process = await originalSpawn(command, args);
    return {
      ...process,
      kill() {
        previewKilled = true;
        process.kill();
      },
    };
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const files = [projectFile("package.json", '{"scripts":{"dev":"vite"}}')];
  await runtime.start(files, [], () => {}, { ...pausedSettings, autoStartPreview: true });
  await runtime.readTypeScriptDeclarations();
  expect(previewKilled).toBe(false);
  let scanKilled = false;
  fake.container.spawn = async () => ({
    output: new ReadableStream(),
    exit: new Promise(() => {}),
    kill() {
      scanKilled = true;
    },
  });
  const request = runtime.readTypeScriptDeclarations();
  const rejected = request.catch((error: Error) => error);
  await Bun.sleep(0);
  await runtime.restart(files, [], () => {}, pausedSettings);
  expect(((await rejected) as Error).message).toContain("cancelled");
  expect(scanKilled).toBe(true);
  runtime.dispose();
});

test("does not expose malformed or over-budget scan output to the editor worker", async () => {
  const fake = fakeContainer();
  fake.container.spawn = async () => ({
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(
          JSON.stringify({ status: "ok", files: [{ path: "../x.d.ts", text: "" }] }),
        );
        controller.close();
      },
    }),
    exit: Promise.resolve(0),
    kill() {},
  });
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start([projectFile("package.json", '{"scripts":{"dev":"vite"}}')], [], () => {}, {
    packageManager: "npm",
    autoInstall: false,
    autoStartPreview: false,
  });

  await expect(runtime.readTypeScriptDeclarations()).rejects.toThrow(
    "Invalid TypeScript declaration path",
  );
  runtime.dispose();
});
