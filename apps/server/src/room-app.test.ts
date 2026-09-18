import { afterEach, expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { readSettings, setSharedSetting } from "@iris/shared";

import { createRoomApp } from "./room-app";
import { createRoomDatabase } from "./db/database";
import { RoomRepository } from "./rooms/room-repository";
import { RoomService } from "./rooms/room-service";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function setup(options?: Parameters<typeof createRoomApp>[1]) {
  const { db, sqlite } = createRoomDatabase(":memory:");
  const rooms = new RoomService(new RoomRepository(db));
  const app = createRoomApp(rooms, options).listen({ port: 0, hostname: "127.0.0.1" });
  const sockets: WebSocket[] = [];
  cleanup.push(async () => {
    for (const socket of sockets) socket.close();
    await app.stop(true);
    rooms.shutdown();
    sqlite.close();
  });
  async function connect(roomId = "demo") {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server!.port}/ws/${roomId}`);
    sockets.push(ws);
    ws.binaryType = "arraybuffer";
    const messages: Array<string | ArrayBuffer> = [];
    ws.addEventListener("message", (event) => messages.push(event.data));
    const closed = new Promise<CloseEvent>((resolve) => ws.addEventListener("close", resolve));
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", reject);
    });
    return { ws, messages, closed };
  }
  return { connect, rooms };
}

function join(ws: WebSocket, userId = "one") {
  ws.send(JSON.stringify({ type: "join", userId, displayName: userId, color: "#d88961" }));
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (assertion()) return;
    await Bun.sleep(5);
  }
  expect(assertion()).toBe(true);
}

test("real WebSocket clients receive snapshots, binary edits and presence", async () => {
  const { connect } = setup();
  const first = await connect();
  const second = await connect();
  join(first.ws);
  join(second.ws, "two");
  await waitFor(() => first.messages.length >= 3 && second.messages.length >= 3);
  const doc = new LoroDoc();
  doc.import(new Uint8Array(first.messages[1] as ArrayBuffer));
  const from = doc.version();
  setSharedSetting(doc, "theme", "nord");
  first.ws.send(new Uint8Array(doc.export({ mode: "update", from })));
  await waitFor(
    () => second.messages.filter((message) => message instanceof ArrayBuffer).length === 2,
  );
  const replica = new LoroDoc();
  for (const message of second.messages) {
    if (message instanceof ArrayBuffer) replica.import(new Uint8Array(message));
  }
  expect(readSettings(replica).theme).toBe("nord");
});

test("closes connections that never join without creating a room", async () => {
  const { connect, rooms } = setup({ joinTimeoutMs: 20 });
  const client = await connect();
  await waitFor(() => client.ws.readyState === WebSocket.CLOSED);
  expect((await client.closed).code).toBe(1008);
  expect(rooms.getDocument("demo")).toBeUndefined();
});

test("limits open connections and releases the slot after disconnect", async () => {
  const { connect } = setup({ maxConnections: 1 });
  const first = await connect();
  const rejected = await connect();
  await waitFor(() => rejected.ws.readyState === WebSocket.CLOSED);
  expect((await rejected.closed).code).toBe(1013);
  first.ws.close();
  await first.closed;
  const next = await connect();
  join(next.ws);
  await waitFor(() => next.messages.length === 3);
});

test("closes oversized frames before importing their contents", async () => {
  const { connect, rooms } = setup({ maxPayloadLength: 256 });
  const client = await connect();
  join(client.ws);
  await waitFor(() => client.messages.length === 3);
  const before = rooms.getDocument("demo")!.toJSON();
  client.ws.send(new Uint8Array(257));
  await waitFor(() => client.ws.readyState === WebSocket.CLOSED);
  expect((await client.closed).code).toBe(1006);
  expect(rooms.getDocument("demo")!.toJSON()).toEqual(before);
});

test("rejects malformed protocol messages instead of retaining idle sockets", async () => {
  const { connect, rooms } = setup();
  const client = await connect();
  client.ws.send(JSON.stringify({ type: "join", userId: 42 }));
  await waitFor(() => client.ws.readyState === WebSocket.CLOSED);
  expect((await client.closed).code).toBe(1008);
  expect(rooms.getDocument("demo")).toBeUndefined();
});

test("bounds message floods on an otherwise valid joined connection", async () => {
  const { connect } = setup({ messagesPerSecond: 2 });
  const client = await connect();
  join(client.ws);
  await waitFor(() => client.messages.length === 3);
  join(client.ws);
  join(client.ws);
  await waitFor(() => client.ws.readyState === WebSocket.CLOSED);
  expect((await client.closed).code).toBe(1008);
});
