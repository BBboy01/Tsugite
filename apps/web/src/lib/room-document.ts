import { LoroDoc } from "loro-crdt";
import { MAX_ROOM_UPDATE_BYTES } from "@iris/shared";

export type DocumentChangeFlags = {
  workspace: boolean;
  settings: boolean;
  content: boolean;
};

export type RoomDocumentEvent =
  | { type: "document"; changes: DocumentChangeFlags }
  | { type: "snapshot" }
  | { type: "import-error" }
  | { type: "oversized"; message: string };

const LOCAL_UPDATE_ERROR =
  "This edit exceeds 1 MiB. Sync stopped; local changes remain in this tab.";
const RECOVERED_UPDATE_ERROR =
  "This draft contains an edit exceeding 1 MiB. Sync stopped; copy your changes into smaller edits.";

export class RoomDocument {
  readonly doc = new LoroDoc();
  private readonly listeners = new Set<(event: RoomDocumentEvent) => void>();
  private receivedSnapshotForConnection = false;
  private hasReceivedSnapshotValue = false;
  private syncErrorValue: string | undefined;

  constructor(private readonly onLocalUpdate: (bytes: Uint8Array) => void) {
    this.doc.subscribe((batch) => {
      const changes: DocumentChangeFlags = { workspace: false, settings: false, content: false };
      for (const event of batch.events) {
        const root = event.path[0];
        if (typeof root === "string" && root.startsWith("file:")) changes.content = true;
        else if (root === "settings") changes.settings = true;
        else if (root === "files" || root === "filePaths" || root === "folders")
          changes.workspace = true;
        else changes.workspace = changes.settings = changes.content = true;
      }
      if (batch.events.length > 0) this.emit({ type: "document", changes });
    });
    this.doc.subscribeLocalUpdates((bytes) => {
      if (bytes.byteLength > MAX_ROOM_UPDATE_BYTES) {
        this.syncErrorValue = LOCAL_UPDATE_ERROR;
        this.emit({ type: "oversized", message: LOCAL_UPDATE_ERROR });
      }
      this.onLocalUpdate(bytes);
    });
  }

  get hasReceivedSnapshot(): boolean {
    return this.hasReceivedSnapshotValue;
  }

  get syncError(): string | undefined {
    return this.syncErrorValue;
  }

  beginConnection(): void {
    this.receivedSnapshotForConnection = false;
  }

  importRemote(data: Uint8Array): void {
    try {
      this.doc.import(data);
    } catch {
      this.emit({ type: "import-error" });
      return;
    }
    if (this.receivedSnapshotForConnection) return;
    this.receivedSnapshotForConnection = true;
    this.hasReceivedSnapshotValue = true;
    this.emit({ type: "snapshot" });
  }

  restorePendingDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): void {
    const validation = new LoroDoc();
    try {
      validation.import(this.doc.export({ mode: "snapshot" }));
      validation.importBatch([snapshot, ...updates]);
    } finally {
      validation.free();
    }
    this.doc.importBatch([snapshot, ...updates]);
    if (updates.some((update) => update.byteLength > MAX_ROOM_UPDATE_BYTES)) {
      this.syncErrorValue = RECOVERED_UPDATE_ERROR;
      this.emit({ type: "oversized", message: RECOVERED_UPDATE_ERROR });
    }
    for (const update of updates) this.onLocalUpdate(update);
  }

  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean {
    if (!this.hasReceivedSnapshotValue) return false;
    const validation = new LoroDoc();
    try {
      validation.import(this.doc.export({ mode: "snapshot" }));
      validation.importBatch([snapshot, ...updates]);
      return validation.version().compare(this.doc.version()) === 0;
    } finally {
      validation.free();
    }
  }

  subscribe(listener: (event: RoomDocumentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RoomDocumentEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
