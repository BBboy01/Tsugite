import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { readSettings, setSharedSetting } from "@iris/shared";

import { RoomService, type RoomSocket } from "./room-service";
import type { RoomStore, StoredRoom } from "./room-repository";

class RecordingStore implements RoomStore {
  readonly rooms = new Map<string, StoredRoom>();
  writes = 0;
  fail = false;

  load(id: string) {
    return this.rooms.get(id);
  }

  save(id: string, snapshot: Uint8Array) {
    if (this.fail) throw new Error("disk unavailable");
    this.writes++;
    this.rooms.set(id, { snapshot, createdAt: 0, updatedAt: this.writes });
  }
}

const instances: Array<{ service: RoomService; store: RecordingStore }> = [];
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  try {
    for (const { service, store } of instances.splice(0)) {
      store.fail = false;
      service.shutdown();
    }
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

function setup(idleTtlMs = 200) {
  const store = new RecordingStore();
  const errors: unknown[] = [];
  const service = new RoomService(store, {
    saveDelayMs: 30,
    idleTtlMs,
    onPersistenceError: (_roomId: string, error: unknown) => errors.push(error),
  });
  instances.push({ service, store });
  const messages: Array<string | Uint8Array> = [];
  const socket: RoomSocket = { send: (data) => messages.push(data) };
  service.join(socket, "demo", joinMessage("one"));
  const doc = new LoroDoc();
  doc.import(messages[1] as Uint8Array);
  return { store, service, socket, doc, errors };
}

function joinMessage(userId: string) {
  return { type: "join", userId, displayName: userId, color: "#d88961" };
}

function updateTheme(
  service: RoomService,
  socket: RoomSocket,
  doc: LoroDoc,
  theme: "nord" | "dracula",
) {
  const from = doc.version();
  setSharedSetting(doc, "theme", theme);
  doc.commit();
  expect(service.update(socket, doc.export({ mode: "update", from }))).toBe(
    true,
  );
}

function persistedTheme(store: RecordingStore) {
  const doc = new LoroDoc();
  doc.import(store.load("demo")!.snapshot);
  return readSettings(doc).theme;
}

test("relays updates immediately and coalesces snapshot writes", () => {
  const { service, store, socket, doc } = setup();
  const received: Array<string | Uint8Array> = [];
  service.join(
    { send: (data) => received.push(data) },
    "demo",
    joinMessage("two"),
  );
  const writes = store.writes;
  const messages = received.length;
  updateTheme(service, socket, doc, "nord");
  expect(received.length).toBe(messages + 1);
  jest.advanceTimersByTime(29);
  expect(store.writes).toBe(writes);
  updateTheme(service, socket, doc, "dracula");
  expect(received.length).toBe(messages + 2);
  expect(store.writes).toBe(writes);
  jest.advanceTimersByTime(1);
  expect(store.writes).toBe(writes + 1);
  expect(persistedTheme(store)).toBe("dracula");
  jest.advanceTimersByTime(30);
  expect(store.writes).toBe(writes + 1);
});

test("continuous edits do not postpone the first save deadline", () => {
  const { service, store, socket, doc } = setup();
  const writes = store.writes;
  for (let index = 0; index < 12; index++) {
    updateTheme(service, socket, doc, index % 2 ? "nord" : "dracula");
    jest.advanceTimersByTime(4);
    if (index === 5) expect(store.writes).toBe(writes);
    if (index === 11) expect(store.writes).toBe(writes + 1);
    jest.advanceTimersByTime(1);
    if (index === 5) expect(store.writes).toBe(writes + 1);
  }
  expect(store.writes).toBeGreaterThan(writes);
  expect(store.writes).toBe(writes + 2);
  expect(service.shutdown()).toBe(true);
  expect(persistedTheme(store)).toBe("nord");
});

test("last leave flushes before idle eviction and reconnect restores the data", () => {
  const { service, store, socket, doc } = setup(20);
  updateTheme(service, socket, doc, "nord");
  service.leave(socket);
  expect(persistedTheme(store)).toBe("nord");
  jest.advanceTimersByTime(19);
  expect(service.getDocument("demo")).toBeDefined();
  jest.advanceTimersByTime(1);
  expect(service.getDocument("demo")).toBeUndefined();
  expect(store.load("demo")).toBeDefined();
  expect(service.join(socket, "demo", joinMessage("one"))).toBe(true);
  expect(readSettings(service.getDocument("demo")!).theme).toBe("nord");
});

test("reconnecting cancels eviction of an active room", () => {
  const { service, socket } = setup(20);
  const original = service.getDocument("demo");
  service.leave(socket);
  jest.advanceTimersByTime(19);
  service.join(socket, "demo", joinMessage("one"));
  expect(jest.getTimerCount()).toBe(0);
  jest.advanceTimersByTime(1);
  expect(service.getDocument("demo")).toBe(original);
  jest.advanceTimersByTime(50);
  expect(service.getDocument("demo")).toBe(original);
  expect(service.memberCount("demo")).toBe(1);
});

test("retries failed snapshot writes at the next save deadline while connected", () => {
  const { service, store, socket, doc, errors } = setup();
  const writes = store.writes;
  store.fail = true;
  updateTheme(service, socket, doc, "nord");
  jest.advanceTimersByTime(29);
  expect(store.writes).toBe(writes);
  expect(errors).toHaveLength(0);
  jest.advanceTimersByTime(1);
  expect(errors).toHaveLength(1);
  store.fail = false;
  jest.advanceTimersByTime(29);
  expect(store.writes).toBe(writes);
  jest.advanceTimersByTime(1);
  expect(store.writes).toBe(writes + 1);
  expect(persistedTheme(store)).toBe("nord");
  expect(service.getDocument("demo")).toBeDefined();
  expect(errors).toHaveLength(1);
});

test("failed saves retain dirty state, prevent eviction and retry after recovery", () => {
  const { service, store, socket, doc, errors } = setup(20);
  store.fail = true;
  updateTheme(service, socket, doc, "nord");
  service.leave(socket);
  jest.advanceTimersByTime(70);
  expect(service.getDocument("demo")).toBeDefined();
  expect(errors).toHaveLength(1);
  const writes = store.writes;
  store.fail = false;
  jest.advanceTimersByTime(9);
  expect(store.writes).toBe(writes);
  expect(service.getDocument("demo")).toBeDefined();
  jest.advanceTimersByTime(1);
  expect(store.writes).toBe(writes + 1);
  expect(persistedTheme(store)).toBe("nord");
  expect(service.getDocument("demo")).toBeUndefined();
  expect(errors).toHaveLength(1);
});

test("shutdown exposes save failure and can retry without losing accepted edits", () => {
  const { service, store, socket, doc } = setup();
  updateTheme(service, socket, doc, "nord");
  store.fail = true;
  expect(service.shutdown()).toBe(false);
  expect(service.join({ send() {} }, "another", joinMessage("two"))).toBe(
    false,
  );
  store.fail = false;
  expect(service.shutdown()).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(persistedTheme(store)).toBe("nord");
  const recovered = new RoomService(store);
  instances.push({ service: recovered, store });
  recovered.join(socket, "demo", joinMessage("one"));
  expect(readSettings(recovered.getDocument("demo")!).theme).toBe("nord");
});
