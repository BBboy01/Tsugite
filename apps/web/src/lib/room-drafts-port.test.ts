import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";
import type { DraftSyncEvent, DraftSyncPort } from "./draft-sync-port";
import { RoomDrafts } from "./room-drafts";
import type { RoomDraft, RoomDraftStore } from "./room-draft-store";

class MemoryStore implements RoomDraftStore {
  private readonly records = new Map<string, RoomDraft>();
  async list(scope: string) {
    return [...this.records.values()].filter((draft) => draft.scope === scope);
  }
  async get(id: string) {
    return this.records.get(id);
  }
  async put(draft: RoomDraft) {
    this.records.set(draft.id, draft);
  }
  async remove(id: string) {
    this.records.delete(id);
  }
  async lock() {
    return () => {};
  }
}

class FakeDraftSync implements DraftSyncPort {
  readonly doc = new LoroDoc();
  readonly draftScope = "fake-room";
  readonly pendingUpdates: readonly Uint8Array[] = [];
  readonly hasPendingChanges = false;

  restorePendingDraft(): void {}
  containsDraft(): boolean {
    return false;
  }
  subscribeDraftSync(_listener: (event: DraftSyncEvent) => void): () => void {
    return () => {};
  }
}

test("accepts a draft sync port without depending on RoomClient", async () => {
  const drafts = new RoomDrafts(new FakeDraftSync(), new MemoryStore());

  await drafts.start();

  expect(drafts.state.available).toHaveLength(0);
  await drafts.dispose();
});
