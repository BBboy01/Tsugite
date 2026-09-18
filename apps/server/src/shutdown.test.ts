import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoroDoc } from "loro-crdt";

import { readSettings, setSharedSetting } from "@iris/shared";

import { RoomRepository } from "./rooms/room-repository";

test.each([
  { signal: "SIGTERM", locked: false },
  { signal: "SIGINT", locked: false },
  { signal: "SIGTERM", locked: true },
] as const)(
  "shutdown $signal with database locked=$locked preserves the flush contract",
  async ({ signal, locked }) => {
    const directory = mkdtempSync(join(tmpdir(), "tsugite-shutdown-"));
    const databasePath = join(directory, "room.sqlite");
    const child = Bun.spawn([process.execPath, "--no-env-file", "apps/server/src/index.ts"], {
      env: { ...process.env, PORT: "0", DATABASE_PATH: databasePath },
      stdout: "pipe",
      stderr: "pipe",
    });
    const sockets: WebSocket[] = [];
    let sqlite: Database | undefined;
    try {
      const reader = child.stdout.getReader();
      let output = "";
      while (!output.includes("\n")) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`Server exited before readiness: ${output}`);
        output += new TextDecoder().decode(value);
      }
      reader.releaseLock();
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      expect(url).toBeDefined();
      const connect = async (userId: string) => {
        const ws = new WebSocket(`${url!.replace("http", "ws")}/ws/shutdown`);
        sockets.push(ws);
        ws.binaryType = "arraybuffer";
        const messages: Array<string | ArrayBuffer> = [];
        ws.addEventListener("message", (event) => messages.push(event.data));
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener("open", () => resolve());
          ws.addEventListener("error", reject);
        });
        ws.send(JSON.stringify({ type: "join", userId, displayName: userId, color: "#d88961" }));
        await waitFor(() => messages.length >= 3);
        return { ws, messages };
      };
      const author = await connect("one");
      const observer = await connect("two");
      const document = new LoroDoc();
      document.import(new Uint8Array(author.messages[1] as ArrayBuffer));
      const from = document.version();
      setSharedSetting(document, "theme", "nord");
      author.ws.send(new Uint8Array(document.export({ mode: "update", from })));
      await waitFor(
        () => observer.messages.filter((message) => message instanceof ArrayBuffer).length === 2,
      );
      sqlite = new Database(databasePath, locked ? { readwrite: true } : { readonly: true });
      const repository = new RoomRepository(drizzle({ client: sqlite }));
      const before = new LoroDoc();
      before.import(repository.load("shutdown")!.snapshot);
      expect(readSettings(before).theme).not.toBe("nord");

      if (locked) sqlite.run("BEGIN IMMEDIATE");
      child.kill(signal);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const code = await Promise.race([
          child.exited,
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => reject(new Error("Shutdown exceeded seven seconds")), 7000);
          }),
        ]);
        expect(code).toBe(locked ? 1 : 0);
      } finally {
        clearTimeout(deadline);
      }
      const restored = new LoroDoc();
      restored.import(repository.load("shutdown")!.snapshot);
      const errors = await new Response(child.stderr).text();
      if (locked) {
        expect(readSettings(restored).theme).not.toBe("nord");
        expect(errors).toContain("Shutdown failed to persist all room snapshots");
      } else {
        expect(readSettings(restored).theme).toBe("nord");
        expect(errors).toBe("");
      }
    } finally {
      for (const socket of sockets) socket.close();
      if (child.exitCode === null) child.kill("SIGKILL");
      await child.exited;
      sqlite?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
  10_000,
);

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (assertion()) return;
    await Bun.sleep(5);
  }
  expect(assertion()).toBe(true);
}
