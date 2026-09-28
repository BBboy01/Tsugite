import type { LoroDoc } from "loro-crdt";
import type { RoomClientEvent } from "./room-events";

export type DraftSyncEvent = Extract<RoomClientEvent, { type: "outbox" | "snapshot" }>;

export interface DraftSyncPort {
  readonly draftScope: string;
  readonly doc: LoroDoc;
  readonly hasPendingChanges: boolean;
  readonly pendingUpdates: readonly Uint8Array[];
  restorePendingDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): void;
  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean;
  subscribeDraftSync(listener: (event: DraftSyncEvent) => void): () => void;
}
