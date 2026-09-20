import { faker } from "@faker-js/faker";
import { LoroDoc } from "loro-crdt";
import { RoomOutbox } from "./room-outbox";

import {
  decodeJsonMessage,
  encodeJsonMessage,
  MAX_ROOM_UPDATE_BYTES,
  type JoinMessage,
  type PresenceListMessage,
  type PresenceMember,
  type PresenceMessage,
  type PresenceRemovedMessage,
} from "@iris/shared";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

export type RoomIdentity = {
  userId: string;
  displayName: string;
  color: string;
};

export type RoomClientOptions = {
  roomId: string;
  identity: RoomIdentity;
  url?: string;
  socketFactory?: (url: string) => RoomSocket;
};

export type RoomSocket = {
  binaryType: string;
  readyState: number;
  send: (data: string | Uint8Array) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer | Uint8Array }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type RoomClientEvent =
  | { type: "outbox" }
  | { type: "snapshot" }
  | { type: "status"; status: ConnectionStatus }
  | { type: "sync"; pending: boolean }
  | { type: "document"; changes: { workspace: boolean; settings: boolean; content: boolean } }
  | { type: "presence"; members: PresenceMember[] };

const OPEN = 1;
const IDENTITY_STORAGE_KEY = "iris.identity.v1";
const RECONNECT_DELAYS = [500, 1000, 2000, 3000];
export const AVATAR_COLORS = ["#d88961", "#7389b7", "#5d9f8c", "#bc76a5"] as const;

export class RoomClient {
  readonly doc = new LoroDoc();
  readonly roomId: string;
  readonly identity: RoomIdentity;
  private readonly socketFactory: (url: string) => RoomSocket;
  private readonly listeners = new Set<(event: RoomClientEvent) => void>();
  private readonly outbox = new RoomOutbox(
    (pending) => this.emit({ type: "sync", pending }),
    () => this.emit({ type: "outbox" }),
  );
  private socket: RoomSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private statusValue: ConnectionStatus = "offline";
  private syncErrorValue: string | undefined;
  private membersValue: PresenceMember[] = [];
  private selectedPath: string | undefined;
  private cursor: { anchor: number; head: number } | null | undefined;
  hasReceivedSnapshot = false;

  constructor(options: RoomClientOptions) {
    this.roomId = options.roomId;
    this.identity = options.identity;
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as RoomSocket);

    this.doc.subscribe((batch) => {
      const changes = { workspace: false, settings: false, content: false };
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
        this.syncErrorValue =
          "This edit exceeds 1 MiB. Sync stopped; local changes remain in this tab.";
        this.disconnect();
        this.emit({ type: "status", status: this.statusValue });
      }
      this.outbox.update(bytes);
    });
  }

  get status(): ConnectionStatus {
    return this.statusValue;
  }

  get syncError(): string | undefined {
    return this.syncErrorValue;
  }

  get hasPendingChanges(): boolean {
    return this.outbox.hasPendingChanges;
  }

  get pendingUpdates(): readonly Uint8Array[] {
    return this.outbox.pendingUpdates;
  }

  get draftScope(): string {
    return this.getSocketUrl();
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
      this.syncErrorValue =
        "This draft contains an edit exceeding 1 MiB. Sync stopped; copy your changes into smaller edits.";
      this.disconnect();
    }
    for (const update of updates) this.outbox.update(update);
  }

  containsDraft(snapshot: Uint8Array, updates: readonly Uint8Array[]): boolean {
    if (!this.hasReceivedSnapshot) return false;
    const validation = new LoroDoc();
    try {
      validation.import(this.doc.export({ mode: "snapshot" }));
      validation.importBatch([snapshot, ...updates]);
      return validation.version().compare(this.doc.version()) === 0;
    } finally {
      validation.free();
    }
  }

  get members(): PresenceMember[] {
    return this.membersValue;
  }

  connect(): void {
    if (this.syncErrorValue) return;
    if (this.socket && this.statusValue !== "offline") return;

    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const url = this.getSocketUrl();
    const socket = this.socketFactory(url);
    let receivedSnapshot = false;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.setStatus("live");
      const join: JoinMessage = { type: "join", ...this.identity };
      socket.send(encodeJsonMessage(join));
      this.outbox.connect((data) => socket.send(data));
      if (this.selectedPath !== undefined || this.cursor !== undefined) {
        this.sendPresence();
      }
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event.data);
      if (typeof event.data !== "string" && !receivedSnapshot) {
        receivedSnapshot = true;
        this.hasReceivedSnapshot = true;
        this.emit({ type: "snapshot" });
      }
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      if (this.statusValue !== "offline") this.setStatus("reconnecting");
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.outbox.disconnect();
      this.socket = null;
      if (this.statusValue !== "offline") this.scheduleReconnect();
    };
    this.socket = socket;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.outbox.disconnect();
    this.setStatus("offline");
    this.socket?.close();
    this.socket = null;
  }

  sendPresence(selectedPath?: string, cursor?: { anchor: number; head: number } | null): void {
    if (selectedPath !== undefined) {
      this.selectedPath = selectedPath;
      if (cursor === undefined) this.cursor = null;
    }
    if (cursor !== undefined) this.cursor = cursor;
    if (this.socket?.readyState !== OPEN) return;

    const message: PresenceMessage = {
      type: "presence",
      ...this.identity,
      selectedPath: this.selectedPath,
      cursor: this.cursor,
    };
    this.outbox.updatePresence(encodeJsonMessage(message));
  }

  updateDisplayName(value: string): boolean {
    const displayName = value.trim();
    if (!displayName || displayName.length > 32 || displayName === this.identity.displayName) {
      return false;
    }

    this.identity.displayName = displayName;
    persistIdentity(this.identity);
    this.membersValue = this.membersValue.map((member) =>
      member.userId === this.identity.userId ? { ...member, displayName } : member,
    );
    this.emit({ type: "presence", members: this.membersValue });
    this.sendPresence();
    return true;
  }

  updateColor(value: string): boolean {
    const color = value.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) return false;
    if (color === this.identity.color) return false;

    this.identity.color = color;
    persistIdentity(this.identity);
    this.membersValue = this.membersValue.map((member) =>
      member.userId === this.identity.userId ? { ...member, color } : member,
    );
    this.emit({ type: "presence", members: this.membersValue });
    this.sendPresence();
    return true;
  }

  subscribe(listener: (event: RoomClientEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleMessage(data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data !== "string") {
      this.doc.import(toUint8Array(data));
      return;
    }

    const message = decodeJsonMessage(data);
    if (!message || typeof message !== "object" || !("type" in message)) return;

    switch (message.type) {
      case "update:ack":
        this.outbox.acknowledge();
        break;
      case "presence:list":
        this.membersValue = mergePresenceList(
          this.membersValue,
          (message as PresenceListMessage).members,
        );
        this.emit({ type: "presence", members: this.membersValue });
        break;
      case "presence":
        this.upsertMember(message as PresenceMessage);
        break;
      case "presence:removed":
        this.removeMember(message as PresenceRemovedMessage);
        break;
    }
  }

  private upsertMember(member: PresenceMember): void {
    const previous = this.membersValue.find((item) => item.userId === member.userId);
    const nextMember = mergePresenceMember(previous, member);
    this.membersValue = [
      ...this.membersValue.filter((item) => item.userId !== nextMember.userId),
      nextMember,
    ];
    this.emit({ type: "presence", members: this.membersValue });
  }

  private removeMember(message: PresenceRemovedMessage): void {
    this.membersValue = this.membersValue.filter((item) => item.userId !== message.userId);
    this.emit({ type: "presence", members: this.membersValue });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.setStatus("reconnecting");
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private getSocketUrl(): string {
    if (typeof window === "undefined") return `ws://127.0.0.1:3001/ws/${this.roomId}`;
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    if (configured) return `${configured.replace(/\/$/, "")}/${this.roomId}`;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = import.meta.env.DEV ? `${window.location.hostname}:3001` : window.location.host;
    return `${protocol}//${host}/ws/${this.roomId}`;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.emit({ type: "status", status });
  }

  private emit(event: RoomClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export function getIdentity(): RoomIdentity {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as RoomIdentity;
        if (parsed.userId && parsed.displayName && parsed.color) return parsed;
      } catch {
        window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
      }
    }
  }

  const identity = createGuestIdentity();
  persistIdentity(identity);
  return identity;
}

export function createGuestIdentity(): RoomIdentity {
  const userId = crypto.randomUUID();
  return {
    userId,
    displayName: faker.internet.username(),
    color: AVATAR_COLORS[userId.charCodeAt(0) % AVATAR_COLORS.length],
  };
}

function persistIdentity(identity: RoomIdentity): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  }
}

function mergePresenceList(
  previous: readonly PresenceMember[],
  incoming: readonly PresenceMember[],
): PresenceMember[] {
  const previousById = new Map(previous.map((member) => [member.userId, member]));
  return incoming.map((member) => mergePresenceMember(previousById.get(member.userId), member));
}

function mergePresenceMember(
  previous: PresenceMember | undefined,
  incoming: PresenceMember,
): PresenceMember {
  return {
    ...previous,
    ...incoming,
    selectedPath:
      "selectedPath" in incoming ? (incoming.selectedPath ?? undefined) : previous?.selectedPath,
    cursor: "cursor" in incoming ? incoming.cursor : previous?.cursor,
  };
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
