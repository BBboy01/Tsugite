import { beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { readSettings, setSharedSetting } from "@iris/shared";

const { LoroDoc } = await import(
  Bun.resolveSync("loro-crdt", join(import.meta.dir, "../apps/server"))
);

const executable = resolve(
  Bun.env.SERVER_EXECUTABLE ?? "dist/server/bun-linux-x64/tsugite-server",
);
const dockerImage = Bun.env.SERVER_TEST_DOCKER_IMAGE;
const dockerNetwork = Bun.env.SERVER_TEST_DOCKER_NETWORK;
if (dockerImage && process.platform !== "linux")
  throw new Error(
    "Run the Docker regression driver on Linux so SQLite locks share the server kernel",
  );

async function docker(...args: string[]) {
  const child = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errors, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`docker ${args[0]} failed: ${errors}`);
  return output.trim();
}

beforeAll(async () => {
  if (dockerImage)
    await docker("pull", "--platform", "linux/amd64", dockerImage);
}, 120_000);

async function waitFor(assertion: () => boolean, description: string) {
  const deadline = Date.now() + 10_000;
  while (!assertion()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await Bun.sleep(10);
  }
}

async function start(directory: string) {
  const name = `tsugite-standalone-${crypto.randomUUID()}`;
  const child = Bun.spawn(
    dockerImage
      ? [
          "docker",
          "run",
          "--pull=never",
          "--rm",
          "--name",
          name,
          "--platform",
          "linux/amd64",
          "--user",
          `${process.getuid!()}:${process.getgid!()}`,
          ...(dockerNetwork
            ? ["--network", dockerNetwork]
            : ["-p", "127.0.0.1::3001"]),
          "-v",
          `${directory}:/app`,
          "-w",
          "/app",
          "-e",
          "PORT=3001",
          "-e",
          "DATABASE_PATH=/app/room.sqlite",
          dockerImage,
          "/app/tsugite-server",
        ]
      : [join(directory, "tsugite-server")],
    {
      cwd: directory,
      env: {
        ...process.env,
        PORT: "0",
        DATABASE_PATH: join(directory, "room.sqlite"),
        ...(!dockerImage ? { PATH: "/nonexistent" } : {}),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const errors = new Response(child.stderr).text();
  let output = "";
  const reading = (async () => {
    for await (const chunk of child.stdout)
      output += new TextDecoder().decode(chunk);
  })();
  const sockets: WebSocket[] = [];
  const close = async () => {
    for (const socket of sockets) socket.close();
    if (dockerImage) await docker("rm", "-f", name).catch(() => {});
    else if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
    await reading;
  };
  try {
    await waitFor(
      () => output.includes("listening on") || child.exitCode !== null,
      "server readiness",
    );
    if (!output.includes("listening on"))
      throw new Error(`Server exited: ${await errors}`);
    const address = dockerImage
      ? dockerNetwork
        ? `http://${name}:3001`
        : `http://${await docker("port", name, "3001/tcp")}`
      : output.match(/http:\/\/127\.0\.0\.1:\d+/)![0];
    expect(await (await fetch(`${address}/health`)).json()).toEqual({
      ok: true,
    });
    return {
      close,
      async signal(signal: "SIGTERM" | "SIGINT") {
        if (dockerImage) await docker("kill", `--signal=${signal}`, name);
        else child.kill(signal);
      },
      async exited() {
        await waitFor(() => child.exitCode !== null, "bounded shutdown");
        return { code: await child.exited, errors: await errors };
      },
      async connect(userId: string) {
        const ws = new WebSocket(
          `${address.replace("http", "ws")}/ws/standalone`,
        );
        sockets.push(ws);
        ws.binaryType = "arraybuffer";
        const doc = new LoroDoc();
        const messages: Record<string, unknown>[] = [];
        let binaries = 0;
        ws.addEventListener("message", ({ data }) => {
          if (data instanceof ArrayBuffer) {
            doc.import(new Uint8Array(data));
            binaries++;
          } else messages.push(JSON.parse(data));
        });
        await waitFor(
          () => ws.readyState !== WebSocket.CONNECTING,
          "WebSocket open",
        );
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.send(
          JSON.stringify({
            type: "join",
            userId,
            displayName: userId,
            color: "#d88961",
          }),
        );
        await waitFor(() => binaries > 0, "binary snapshot");
        return { ws, doc, messages };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  for (const lock of ["none", "transient", "persistent"] as const) {
    test(`${signal}, ${lock} lock: isolated executable migrates, syncs, ACKs, reconnects and restores`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "tsugite-standalone-"));
      const running: Awaited<ReturnType<typeof start>>[] = [];
      let sqlite: Database | undefined;
      let releaseLock: ReturnType<typeof setTimeout> | undefined;
      try {
        await cp(executable, join(directory, "tsugite-server"));
        await cp(
          join(dirname(executable), "drizzle"),
          join(directory, "drizzle"),
          { recursive: true },
        );
        expect((await readdir(directory)).sort()).toEqual([
          "drizzle",
          "tsugite-server",
        ]);
        const server = await start(directory);
        running.push(server);
        const author = await server.connect("author");
        const observer = await server.connect("observer");
        const from = author.doc.version();
        setSharedSetting(author.doc, "theme", "nord");
        author.ws.send(
          new Uint8Array(author.doc.export({ mode: "update", from })),
        );
        await waitFor(
          () =>
            author.messages.some((message) => message.type === "update:ack"),
          "edit ACK",
        );
        await waitFor(
          () => readSettings(observer.doc).theme === "nord",
          "collaboration",
        );
        author.ws.close();
        await waitFor(
          () => author.ws.readyState === WebSocket.CLOSED,
          "disconnect",
        );
        const reconnected = await server.connect("author");
        expect(readSettings(reconnected.doc).theme).toBe("nord");
        sqlite = new Database(join(directory, "room.sqlite"));
        const migrations = sqlite
          .query("SELECT * FROM __drizzle_migrations")
          .all();
        expect(migrations.length).toBeGreaterThan(0);
        // Persist the baseline before blocking writes, so failure has a known recovery point.
        await waitFor(() => {
          const row = sqlite!
            .query(
              "SELECT snapshot_blob FROM rooms WHERE room_id = 'standalone'",
            )
            .get() as { snapshot_blob: Uint8Array };
          const saved = new LoroDoc();
          saved.import(row.snapshot_blob);
          return readSettings(saved).theme === "nord";
        }, "baseline persistence");
        if (lock !== "none") {
          sqlite.run("BEGIN IMMEDIATE");
          // BEGIN can succeed on a read-only connection without taking a writer lock.
          expect(
            sqlite
              .query(
                "UPDATE rooms SET updated_at = updated_at WHERE room_id = 'standalone'",
              )
              .run().changes,
          ).toBe(1);
        }
        const next = reconnected.doc.version();
        setSharedSetting(reconnected.doc, "theme", "dracula");
        reconnected.ws.send(
          new Uint8Array(
            reconnected.doc.export({ mode: "update", from: next }),
          ),
        );
        await waitFor(
          () =>
            reconnected.messages.some(
              (message) => message.type === "update:ack",
            ),
          "shutdown edit ACK",
        );
        const shutdownAt = Date.now();
        await server.signal(signal);
        if (lock === "transient")
          releaseLock = setTimeout(() => sqlite!.run("ROLLBACK"), 750);
        const result = await server.exited();
        expect(Date.now() - shutdownAt).toBeLessThan(8000);
        expect(result.code).toBe(lock === "persistent" ? 1 : 0);
        if (lock === "persistent") {
          expect(result.errors).toContain(
            "Shutdown failed to persist all room snapshots",
          );
          sqlite.run("ROLLBACK");
        } else if (lock === "none") expect(result.errors).toBe("");
        await server.close();
        const restarted = await start(directory);
        running.push(restarted);
        const restored = await restarted.connect("restored");
        expect(readSettings(restored.doc).theme).toBe(
          lock === "persistent" ? "nord" : "dracula",
        );
        expect(
          sqlite.query("SELECT * FROM __drizzle_migrations").all(),
        ).toEqual(migrations);
        await restarted.signal("SIGTERM");
        expect((await restarted.exited()).code).toBe(0);
      } finally {
        clearTimeout(releaseLock);
        for (const server of running) await server.close();
        sqlite?.close();
        await rm(directory, { recursive: true, force: true });
      }
    }, 40_000);
  }
}
