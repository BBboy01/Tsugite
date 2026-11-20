import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LoroDoc } from "loro-crdt";

import { readSettings, setSharedSetting } from "@iris/shared";

import { RoomRepository } from "./rooms/room-repository";

const root = resolve(import.meta.dir, "../../..");
const manifest = await Bun.file(join(root, "package.json")).json();

function setup(script = "dev", failServer = false, failWeb = false) {
  const directory = mkdtempSync(join(tmpdir(), "tsugite-dev-"));
  const reservations = [0, 1].map(() =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      reusePort: false,
      fetch: () => new Response(),
    }),
  );
  const serverPort = reservations[0]!.port!;
  const webPort = reservations[1]!.port!;
  reservations[0]!.stop(true);
  if (!failWeb) reservations[1]!.stop(true);
  for (const path of ["apps", "node_modules", "drizzle", "scripts"]) {
    symlinkSync(join(root, path), join(directory, path), "dir");
  }
  mkdirSync(join(directory, "bin"));
  symlinkSync(process.execPath, join(directory, "bin/bun"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ type: "module", scripts: manifest.scripts }),
  );
  writeFileSync(
    join(directory, "vite.config.ts"),
    `import { mergeConfig } from "vite";
import config from ${JSON.stringify(pathToFileURL(join(root, "vite.config.ts")).href)};
export default mergeConfig(config, {
  root: ${JSON.stringify(join(root, "apps/web"))},
  envDir: false,
  cacheDir: ${JSON.stringify(join(directory, "vite-cache"))},
  server: { port: ${webPort}, strictPort: true },
  define: { "import.meta.env.VITE_WS_URL": ${JSON.stringify(JSON.stringify(`ws://127.0.0.1:${serverPort}/ws`))} }
});`,
  );
  const databasePath = join(directory, "rooms.sqlite");
  const child = Bun.spawn([process.execPath, "--no-env-file", "run", script], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: `${join(directory, "bin")}:${process.env.PATH}`,
      PORT: String(serverPort),
      DATABASE_PATH: failServer ? directory : databasePath,
      NO_COLOR: "1",
    },
    detached: true,
    stdout: "pipe",
    stderr: "pipe",
  });
  let output = "";
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream)
      output += decoder.decode(chunk, { stream: true });
  };
  const drained = Promise.all([capture(child.stdout), capture(child.stderr)]);
  const processes = new Set<number>();
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const signal = (value: NodeJS.Signals, parentOnly = false) => {
    for (const pid of descendants(child.pid)) processes.add(pid);
    try {
      process.kill(parentOnly ? child.pid : -child.pid, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  return {
    child,
    databasePath,
    serverPort,
    webPort,
    signal,
    output: () => output,
    async ready(frontend = true, backend = true) {
      await waitFor(() => {
        if (exited()) throw new Error(`Development command exited: ${output}`);
        return (
          (!backend || output.includes("server listening")) &&
          (!frontend || output.includes("Local:"))
        );
      }, "development readiness");
    },
    async waitForExit() {
      try {
        await waitFor(exited, "development exit");
      } catch (error) {
        throw new Error(`${String(error)}\n${output}`, { cause: error });
      }
      await drained;
      return child.exited;
    },
    async cleanup() {
      for (const pid of [...processes, ...descendants(child.pid)].reverse()) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      signal("SIGKILL");
      await child.exited;
      await drained;
      reservations[1]!.stop(true);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

async function waitFor(predicate: () => boolean, description: string) {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
    await Bun.sleep(10);
  }
}

function descendants(parent: number) {
  const result = Bun.spawnSync(["ps", "-axo", "pid=,ppid="], {
    stdout: "pipe",
  });
  expect(result.exitCode).toBe(0);
  const rows = result.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const ids = new Set([parent]);
  for (let size = 0; size !== ids.size;) {
    size = ids.size;
    for (const [pid, ppid] of rows) if (ids.has(ppid!)) ids.add(pid!);
  }
  return [...ids];
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    return false;
  }
}

function expectPortReleased(port: number) {
  const listener = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => new Response(),
  });
  listener.stop(true);
}

describe.skipIf(process.platform === "win32")("development commands", () => {
  test.each([
    { signal: "SIGINT", locked: false, parentOnly: false },
    { signal: "SIGTERM", locked: false, parentOnly: false },
    { signal: "SIGINT", locked: true, parentOnly: false },
    { signal: "SIGTERM", locked: true, parentOnly: false },
    { signal: "SIGINT", locked: true, parentOnly: true },
    { signal: "SIGTERM", locked: true, parentOnly: true },
  ] as const)(
    "dev $signal with transient lock=$locked parent-only=$parentOnly saves edits and releases processes",
    async ({ signal, locked, parentOnly }) => {
      const dev = setup();
      const sockets: WebSocket[] = [];
      let sqlite: Database | undefined;
      let release: ReturnType<typeof setTimeout> | undefined;
      let databaseLocked = false;
      try {
        await dev.ready();
        const serverUrl = `http://127.0.0.1:${dev.serverPort}`;
        expect(await (await fetch(`${serverUrl}/health`)).json()).toEqual({
          ok: true,
        });
        const page = await fetch(
          `http://127.0.0.1:${dev.webPort}/room/dev-command`,
        );
        expect(page.status).toBe(200);
        expect(await page.text()).toContain("/src/main.tsx");
        expect(
          (await fetch(`http://127.0.0.1:${dev.webPort}/src/main.tsx`)).status,
        ).toBe(200);
        const connect = async (userId: string) => {
          const socket = new WebSocket(
            `${serverUrl.replace("http", "ws")}/ws/dev-command`,
          );
          sockets.push(socket);
          socket.binaryType = "arraybuffer";
          const messages: Array<string | ArrayBuffer> = [];
          socket.addEventListener("message", (event) =>
            messages.push(event.data),
          );
          await waitFor(
            () => socket.readyState === WebSocket.OPEN,
            "WebSocket open",
          );
          socket.send(
            JSON.stringify({
              type: "join",
              userId,
              displayName: userId,
              color: "#d88961",
            }),
          );
          await waitFor(() => messages.length >= 3, "room snapshot");
          return { socket, messages };
        };
        const author = await connect("author");
        const observer = await connect("observer");
        sqlite = new Database(dev.databasePath, { readwrite: true });
        const repository = new RoomRepository(drizzle({ client: sqlite }));
        if (locked) {
          sqlite.run("BEGIN IMMEDIATE");
          databaseLocked = true;
        }
        const document = new LoroDoc();
        document.import(new Uint8Array(author.messages[1] as ArrayBuffer));
        const from = document.version();
        setSharedSetting(document, "theme", "nord");
        author.socket.send(
          new Uint8Array(document.export({ mode: "update", from })),
        );
        await waitFor(
          () =>
            author.messages.some(
              (message) =>
                typeof message === "string" &&
                JSON.parse(message).type === "update:ack",
            ),
          "edit acknowledgement",
        );
        await waitFor(
          () =>
            observer.messages.filter(
              (message) => message instanceof ArrayBuffer,
            ).length === 2,
          "collaborator update",
        );
        const before = new LoroDoc();
        before.import(repository.load("dev-command")!.snapshot);
        expect(readSettings(before).theme).not.toBe("nord");
        const processes = descendants(dev.child.pid);
        expect(processes.length).toBeGreaterThan(2);
        dev.signal(signal, parentOnly);
        if (locked)
          release = setTimeout(() => {
            sqlite!.run("ROLLBACK");
            databaseLocked = false;
          }, 200);
        const code = await dev.waitForExit();
        expect([0, 130]).toContain(code);
        expect(databaseLocked, dev.output()).toBe(false);
        const restored = new LoroDoc();
        restored.import(repository.load("dev-command")!.snapshot);
        expect(readSettings(restored).theme).toBe("nord");
        await waitFor(
          () => processes.every((pid) => !isRunning(pid)),
          "descendant cleanup",
        );
        expectPortReleased(dev.serverPort);
        expectPortReleased(dev.webPort);
        expect(dev.output()).not.toContain("Shutdown failed to persist");
      } finally {
        clearTimeout(release);
        if (databaseLocked) sqlite?.run("ROLLBACK");
        for (const socket of sockets) socket.close();
        sqlite?.close();
        await dev.cleanup();
      }
    },
    20_000,
  );

  test("dev reports a server startup failure and stops the web process", async () => {
    const dev = setup("dev", true);
    try {
      expect(await dev.waitForExit()).not.toBe(0);
      expect(dev.output()).toMatch(/open.*database|database.*open|directory/i);
      expectPortReleased(dev.webPort);
    } finally {
      await dev.cleanup();
    }
  }, 20_000);

  test("dev reports a web startup failure and stops the server process", async () => {
    const dev = setup("dev", false, true);
    try {
      expect(await dev.waitForExit()).not.toBe(0);
      expect(dev.output()).toMatch(/Port \d+ is already in use|EADDRINUSE/i);
      expectPortReleased(dev.serverPort);
    } finally {
      await dev.cleanup();
    }
    expectPortReleased(dev.webPort);
  }, 20_000);

  test.each(["dev:web", "dev:server"])(
    "%s remains usable independently",
    async (script) => {
      const dev = setup(script);
      try {
        await dev.ready(script === "dev:web", script === "dev:server");
        const port = script === "dev:web" ? dev.webPort : dev.serverPort;
        const response = await fetch(
          `http://127.0.0.1:${port}/${script === "dev:web" ? "room/dev-command" : "health"}`,
        );
        expect(response.status).toBe(200);
        dev.signal("SIGINT");
        await dev.waitForExit();
        expectPortReleased(port);
      } finally {
        await dev.cleanup();
      }
    },
    20_000,
  );
});
