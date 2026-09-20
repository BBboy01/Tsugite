import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";
import { RoomClient, type RoomSocket } from "./room-client";
import { RoomDrafts } from "./room-drafts";
import type { RoomDraft, RoomDraftStore } from "./room-draft-store";

class MemoryStore implements RoomDraftStore {
  records = new Map<string, RoomDraft>();
  locks = new Set<string>();
  fail = false;
  async list(scope: string) {
    return [...this.records.values()].filter((draft) => draft.scope === scope);
  }
  async get(id: string) {
    return this.records.get(id);
  }
  async put(draft: RoomDraft) {
    if (this.fail) throw new Error("quota");
    this.records.set(draft.id, structuredClone(draft));
  }
  async remove(id: string) {
    if (this.fail) throw new Error("quota");
    this.records.delete(id);
  }
  async lock(id: string) {
    if (this.locks.has(id)) return undefined;
    this.locks.add(id);
    return () => {
      this.locks.delete(id);
    };
  }
}

function setup(store: MemoryStore, scope = "room-a") {
  const socket: RoomSocket = {
    binaryType: "",
    readyState: 1,
    send: () => {},
    close: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const client = new RoomClient({
    roomId: scope,
    identity: { userId: crypto.randomUUID(), displayName: "User", color: "#7389b7" },
    socketFactory: () => socket,
  });
  const drafts = new RoomDrafts(client, scope, store);
  return { client, drafts, socket };
}

test("reopening offers a saved draft without importing it until restore", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "offline draft");
  first.client.doc.commit();
  await first.drafts.flush();
  expect(first.drafts.state.backup).toBe("saved");
  await first.drafts.dispose();
  const next = setup(store);
  await next.drafts.start();
  expect(next.drafts.state.available).toHaveLength(1);
  expect(next.client.doc.getText("text").toString()).toBe("");
  expect(next.client.hasPendingChanges).toBe(false);
  await next.drafts.restore();
  expect(next.client.doc.getText("text").toString()).toBe("offline draft");
  expect(next.client.hasPendingChanges).toBe(true);
  expect(next.drafts.state.available).toHaveLength(0);
  expect(store.records.size).toBe(1);
  await next.drafts.dispose();
});

test("restoration merges remote edits and acknowledgements clear the local backup", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  const base = new LoroDoc();
  base.getText("text").insert(0, "base");
  first.client.doc.import(base.export({ mode: "snapshot" }));
  first.client.doc.getText("text").insert(4, " local");
  first.client.doc.commit();
  await first.drafts.dispose();
  const next = setup(store);
  base.getText("remote").insert(0, "remote edit");
  next.client.doc.import(base.export({ mode: "snapshot" }));
  await next.drafts.start();
  await next.drafts.restore();
  expect(next.client.doc.getText("remote").toString()).toBe("remote edit");
  expect(next.client.doc.getText("text").toString()).toBe("base local");
  next.client.connect();
  next.socket.onopen?.();
  next.socket.onmessage?.({ data: '{"type":"update:ack"}' });
  await next.drafts.flush();
  expect(store.records.size).toBe(0);
  expect(next.client.hasPendingChanges).toBe(false);
  next.client.disconnect();
  await next.drafts.dispose();
});

test("discard never imports or sends the draft", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "discard me");
  first.client.doc.commit();
  await first.drafts.dispose();
  const next = setup(store);
  await next.drafts.start();
  await next.drafts.discard();
  expect(store.records.size).toBe(0);
  expect(next.client.doc.getText("text").toString()).toBe("");
  expect(next.client.hasPendingChanges).toBe(false);
  await next.drafts.dispose();
});

test("other rooms and active tabs cannot claim a draft", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "active");
  first.client.doc.commit();
  await first.drafts.flush();
  const sibling = setup(store);
  await sibling.drafts.start();
  expect(sibling.drafts.state.available).toHaveLength(0);
  await first.drafts.dispose();
  const other = setup(store, "room-b");
  await other.drafts.start();
  expect(other.drafts.state.available).toHaveLength(0);
  await sibling.drafts.dispose();
  await other.drafts.dispose();
  expect(store.records.size).toBe(1);
});

test("failed checkpoint retains the original recovery record and reports failure", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "retained");
  first.client.doc.commit();
  await first.drafts.dispose();
  const next = setup(store);
  await next.drafts.start();
  store.fail = true;
  await next.drafts.restore();
  expect(next.drafts.state.error).toBeDefined();
  expect(store.records.size).toBe(1);
  expect(next.drafts.state.available).toHaveLength(1);
  expect(next.client.hasPendingChanges).toBe(true);
  store.fail = false;
  await next.drafts.discard();
  expect(store.records.size).toBe(1);
  expect(next.drafts.state.available).toHaveLength(1);
  const queued = next.client.pendingUpdates.length;
  await next.drafts.restore();
  expect(next.drafts.state.available).toHaveLength(0);
  expect(next.client.pendingUpdates).toHaveLength(queued);
  expect(store.records.size).toBe(1);
  await next.drafts.dispose();
});

test("corrupted CRDT data cannot partially change the live document", async () => {
  const store = new MemoryStore();
  store.records.set("corrupt", {
    version: 1,
    id: "corrupt",
    scope: "room-a",
    updatedAt: Date.now(),
    snapshot: new Uint8Array([1, 2, 3]),
    updates: [new Uint8Array([4, 5])],
  });
  const next = setup(store);
  await next.drafts.start();
  await next.drafts.restore();
  expect(next.drafts.state.error).toBeDefined();
  expect(next.client.hasPendingChanges).toBe(false);
  expect(next.client.doc.toJSON()).toEqual({});
  expect(store.records.size).toBe(1);
  await next.drafts.discard();
  expect(store.records.size).toBe(0);
  await next.drafts.dispose();
});

test("a server snapshot covering a leftover draft removes it without prompting", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "already synced");
  first.client.doc.commit();
  const snapshot = first.client.doc.export({ mode: "snapshot" });
  await first.drafts.dispose();
  const next = setup(store);
  await next.drafts.start();
  expect(next.drafts.state.available).toHaveLength(1);
  next.client.connect();
  next.socket.onopen?.();
  next.socket.onmessage?.({ data: snapshot });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(next.drafts.state.available).toHaveLength(0);
  expect(store.records.size).toBe(0);
  next.client.disconnect();
  await next.drafts.dispose();
});

test("acknowledgements arriving during a checkpoint cannot leave a stale backup", async () => {
  const store = new MemoryStore();
  const originalPut = store.put.bind(store);
  let finish!: () => void;
  store.put = async (draft) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await originalPut(draft);
  };
  const current = setup(store);
  await current.drafts.start();
  current.client.connect();
  current.socket.onopen?.();
  current.client.doc.getText("text").insert(0, "race");
  current.client.doc.commit();
  const saving = current.drafts.flush();
  current.socket.onmessage?.({ data: '{"type":"update:ack"}' });
  finish();
  await saving;
  expect(store.records.size).toBe(0);
  expect(current.drafts.state.backup).toBe("idle");
  current.client.disconnect();
  await current.drafts.dispose();
});

test("oversized recovered edits stay local and retain a recoverable copy", async () => {
  const store = new MemoryStore();
  const first = setup(store);
  await first.drafts.start();
  first.client.doc.getText("text").insert(0, "x".repeat(1_100_000));
  first.client.doc.commit();
  await first.drafts.dispose();
  const next = setup(store);
  await next.drafts.start();
  await next.drafts.restore();
  expect(next.client.syncError).toBeDefined();
  expect(next.client.status).toBe("offline");
  expect(next.client.doc.getText("text").length).toBe(1_100_000);
  expect(store.records.size).toBe(1);
  await next.drafts.dispose();
}, 30_000);
