import { afterEach, expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { setSharedSetting } from "@iris/shared";

import { createRoomDatabase } from "../db/database";
import { RoomRepository } from "./room-repository";
import { RoomService, type RoomSocket } from "./room-service";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((close) => close()));

function setup(options: ConstructorParameters<typeof RoomService>[1] = {}) {
  const { db, sqlite } = createRoomDatabase(":memory:");
  const repository = new RoomRepository(db);
  const service = new RoomService(repository, options);
  cleanup.push(() => {
    service.shutdown();
    sqlite.close();
  });
  const socket: RoomSocket = { send() {} };
  const join = (roomId: string, client = socket, userId = "one") =>
    service.join(client, roomId, { type: "join", userId, displayName: userId, color: "#d88961" });
  return { service, repository, join, socket };
}

test("rejects unsafe or excessive room identifiers before creating stored rooms", () => {
  const { repository, join, service } = setup();
  for (const id of ["", "../room", "a/b", "a b", "x".repeat(81)]) {
    expect(join(id)).toBe(false);
    expect(repository.load(id)).toBeUndefined();
    expect(service.getDocument(id)).toBeUndefined();
  }
  expect(join("room_123-ABC")).toBe(true);
});

test("rejects oversized valid CRDT updates without changing the document", () => {
  const { service, socket, join } = setup({ maxUpdateBytes: 16 });
  join("demo");
  const original = service.getDocument("demo")!;
  const expected = original.toJSON();
  const doc = new LoroDoc();
  doc.import(original.export({ mode: "snapshot" }));
  setSharedSetting(doc, "theme", "nord");
  expect(service.update(socket, doc.export({ mode: "update" }))).toBe(false);
  expect(original.toJSON()).toEqual(expected);
});

test("enforces resident-room capacity without creating a rejected room", async () => {
  const { service, repository, join, socket } = setup({ maxRooms: 1, idleTtlMs: 10 });
  expect(join("first")).toBe(true);
  const second = { send() {} };
  expect(join("second", second)).toBe(false);
  expect(repository.load("second")).toBeUndefined();
  service.leave(socket);
  await Bun.sleep(30);
  expect(join("second", second)).toBe(true);
});

test("enforces member and total client capacity and releases capacity on leave", () => {
  const { service, join, socket } = setup({ maxClients: 2, maxMembers: 1 });
  expect(join("first")).toBe(true);
  const second = { send() {} };
  expect(join("first", second, "two")).toBe(false);
  expect(join("second", second, "two")).toBe(true);
  const third = { send() {} };
  expect(join("third", third, "three")).toBe(false);
  service.leave(socket);
  expect(join("third", third, "three")).toBe(true);
});

test("rate limits new rooms but allows existing-room recovery and later creation", async () => {
  let now = 0;
  const { service, repository, join, socket } = setup({
    roomCreationLimit: 1,
    roomCreationWindowMs: 100,
    now: () => now,
    idleTtlMs: 10,
  });
  expect(join("first")).toBe(true);
  const second = { send() {} };
  expect(join("second", second)).toBe(false);
  expect(repository.load("second")).toBeUndefined();
  service.leave(socket);
  await Bun.sleep(30);
  expect(join("first", socket)).toBe(true);
  now = 100;
  expect(join("second", second)).toBe(true);
});
