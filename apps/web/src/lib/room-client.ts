import { LoroDoc } from "loro-crdt";
import { RoomOutbox } from "./room-outbox";
import { RoomDocument, type RoomDocumentEvent } from "./room-document";
import { RoomPresence, type RoomIdentity } from "./room-presence";
import {
  RoomTransport,
  type ConnectionStatus,
  type RoomSocket,
  type TransportEvent,
} from "./room-transport";
import { type RoomClientEvent } from "./room-events";
import type { DraftSyncEvent, DraftSyncPort } from "./draft-sync-port";

import {
  decodeServerJsonMessage,
  encodeJsonMessage,
  type JoinMessage,
  type PresenceMember,
} from "@iris/shared";

export { AVATAR_COLORS, createGuestIdentity, getIdentity } from "./room-presence";
export type { RoomIdentity } from "./room-presence";

export type RoomClientOptions = {
  roomId: string;
  identity: RoomIdentity;
  url?: string;
  socketFactory?: (url: string) => RoomSocket;
};

export type { RoomSocket } from "./room-transport";
export type { ConnectionStatus } from "./room-transport";

export type { RoomClientEvent } from "./room-events";

const IMPORT_ERROR = "Unable to apply room data. Reconnecting; local changes remain in this tab.";

export class RoomClient implements DraftSyncPort {
  readonly roomId: string;
  readonly identity: RoomIdentity;
  private readonly transport: RoomTransport;
  private readonly document: RoomDocument;
  private readonly presence: RoomPresence;
  private readonly listeners = new Set<(event: RoomClientEvent) => void>();
  private readonly outbox = new RoomOutbox(
    (pending) => this.emit({ type: "sync", pending }),
    () => this.emit({ type: "outbox" }),
  );
  private readonly socketUrl: string;
  private syncErrorValue: string | undefined;
  private importError: string | undefined;
  constructor(options: RoomClientOptions) {
    this.roomId = options.roomId;
    this.identity = options.identity;
    const socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as RoomSocket);
    this.socketUrl = options.url ?? this.resolveSocketUrl();
    this.transport = new RoomTransport({ url: this.socketUrl, socketFactory });
    this.transport.subscribe((event) => this.handleTransportEvent(event));
    this.document = new RoomDocument((bytes) => this.outbox.update(bytes));
    this.document.subscribe((event) => this.handleDocumentEvent(event));
    this.presence = new RoomPresence(this.identity, (message) => {
      if (this.transport.status === "live") this.outbox.updatePresence(encodeJsonMessage(message));
    });
    this.presence.subscribe((members) => this.emit({ type: "presence", members }));
  }

  get doc(): LoroDoc {
    return this.document.doc;
  }

  get hasReceivedSnapshot(): boolean {
    return this.document.hasReceivedSnapshot;
  }

  get status(): ConnectionStatus {
    if (this.importError && this.transport.status !== "offline") return "reconnecting";
    return this.transport.status;
  }

  get syncError(): string | undefined {
    return this.syncErrorValue ?? this.document.syncError ?? this.importError;
  }

  get hasPendingChanges(): boolean {
    return this.outbox.hasPendingChanges;
  }

  get pendingUpdates(): readonly Uint8Array[] {
    return this.outbox.pendingUpdates;
  }

  get draftScope(): string {
    return this.socketUrl;
  }

  restorePendingDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): void {
    this.document.restorePendingDraft(snapshot, updates);
  }

  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean {
    return this.document.containsDraft(snapshot, updates);
  }

  get members(): PresenceMember[] {
    return this.presence.members;
  }

  getStatusSnapshot = (): ConnectionStatus => this.status;

  getMembersSnapshot = (): PresenceMember[] => this.members;

  getPendingChangesSnapshot = (): boolean => this.hasPendingChanges;

  connect(): void {
    if (this.syncErrorValue) return;
    this.transport.connect();
  }

  disconnect(): void {
    this.outbox.disconnect();
    this.transport.disconnect();
  }

  sendPresence(selectedPath?: string, cursor?: { anchor: number; head: number } | null): void {
    this.presence.send(selectedPath, cursor);
  }

  updateDisplayName(value: string): boolean {
    return this.presence.updateDisplayName(value);
  }

  updateColor(value: string): boolean {
    return this.presence.updateColor(value);
  }

  subscribe(listener: (event: RoomClientEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus = (listener: () => void): (() => void) =>
    this.subscribe((event) => {
      if (event.type === "status") listener();
    });

  subscribePresence = (listener: () => void): (() => void) =>
    this.subscribe((event) => {
      if (event.type === "presence") listener();
    });

  subscribeSync = (listener: () => void): (() => void) =>
    this.subscribe((event) => {
      if (event.type === "sync") listener();
    });

  subscribeSnapshot = (listener: () => void): (() => void) =>
    this.subscribe((event) => {
      if (event.type === "snapshot") listener();
    });

  getSnapshotReceived = (): boolean => this.hasReceivedSnapshot;

  subscribeDraftSync(listener: (event: DraftSyncEvent) => void): () => void {
    return this.subscribe((event) => {
      if (event.type === "outbox" || event.type === "snapshot") listener(event);
    });
  }

  private handleTransportEvent(event: TransportEvent): void {
    switch (event.type) {
      case "status":
        this.emit({ type: "status", status: this.status });
        break;
      case "open": {
        this.document.beginConnection();
        const join: JoinMessage = { type: "join", ...this.identity };
        this.transport.send(encodeJsonMessage(join));
        this.outbox.connect((data) => this.transport.send(data));
        if (this.presence.hasLocalState) {
          this.sendPresence();
        }
        break;
      }
      case "message":
        this.handleMessage(event.data);
        break;
      case "close":
        this.outbox.disconnect();
        break;
      case "error":
        break;
    }
  }

  private handleMessage(data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data !== "string") {
      this.document.importRemote(toUint8Array(data));
      return;
    }

    const message = decodeServerJsonMessage(data);
    if (!message) return;

    switch (message.type) {
      case "update:ack":
        this.outbox.acknowledge();
        break;
      case "presence:list":
        this.presence.receiveList(message);
        break;
      case "presence":
        this.presence.receive(message);
        break;
      case "presence:removed":
        this.presence.remove(message);
        break;
    }
  }

  private handleDocumentEvent(event: RoomDocumentEvent): void {
    if (event.type === "import-error") {
      this.importError = IMPORT_ERROR;
      this.transport.reconnect();
      return;
    }
    if (event.type === "oversized") {
      this.syncErrorValue = event.message;
      this.disconnect();
      return;
    }
    if (event.type === "snapshot") {
      this.transport.markHealthy();
      if (this.importError) {
        this.importError = undefined;
        this.emit({ type: "status", status: this.status });
      }
    }
    this.emit(event);
  }

  private resolveSocketUrl(): string {
    if (typeof window === "undefined") return `ws://127.0.0.1:3001/ws/${this.roomId}`;
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    if (configured) return `${configured.replace(/\/$/, "")}/${this.roomId}`;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.DEV ? `${window.location.hostname}:3001` : window.location.host;
    return `${protocol}//${host}/ws/${this.roomId}`;
  }

  private emit(event: RoomClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
