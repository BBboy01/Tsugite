import { faker } from "@faker-js/faker";
import { LoroDoc } from "loro-crdt";

import {
  decodeJsonMessage,
  encodeJsonMessage,
  type JoinMessage,
  type PresenceListMessage,
  type PresenceMember,
  type PresenceMessage,
  type PresenceRemovedMessage,
  type ServerReadyMessage,
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
  | { type: "status"; status: ConnectionStatus }
  | { type: "document" }
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
  private readonly queuedUpdates: Uint8Array[] = [];
  private socket: RoomSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private statusValue: ConnectionStatus = "offline";
  private membersValue: PresenceMember[] = [];
  private selectedPath: string | undefined;
  private cursor: { anchor: number; head: number } | undefined;

  constructor(options: RoomClientOptions) {
    this.roomId = options.roomId;
    this.identity = options.identity;
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as RoomSocket);

    this.doc.subscribeLocalUpdates((bytes) => {
      if (this.socket?.readyState === OPEN) {
        this.socket.send(bytes);
      } else {
        this.queuedUpdates.push(bytes);
      }
      this.emit({ type: "document" });
    });
  }

  get status(): ConnectionStatus {
    return this.statusValue;
  }

  get members(): PresenceMember[] {
    return this.membersValue;
  }

  connect(): void {
    if (this.socket && this.statusValue !== "offline") return;

    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const url = this.getSocketUrl();
    const socket = this.socketFactory(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus("live");
      const join: JoinMessage = { type: "join", ...this.identity };
      socket.send(encodeJsonMessage(join));
      this.flushQueue();
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      if (this.statusValue !== "offline") this.setStatus("reconnecting");
    };
    socket.onclose = () => {
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
    this.setStatus("offline");
    this.socket?.close();
    this.socket = null;
  }

  sendPresence(selectedPath?: string, cursor?: { anchor: number; head: number }): void {
    if (this.socket?.readyState !== OPEN) return;

    if (selectedPath !== undefined) this.selectedPath = selectedPath;
    if (cursor !== undefined) this.cursor = cursor;

    const message: PresenceMessage = {
      type: "presence",
      ...this.identity,
      selectedPath: this.selectedPath,
      cursor: this.cursor,
    };
    this.socket.send(encodeJsonMessage(message));
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
      this.emit({ type: "document" });
      return;
    }

    const message = decodeJsonMessage(data);
    if (!message || typeof message !== "object" || !("type" in message)) return;

    switch (message.type) {
      case "ready":
        this.handleReady(message as ServerReadyMessage);
        break;
      case "presence:list":
        this.membersValue = (message as PresenceListMessage).members;
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

  private handleReady(message: ServerReadyMessage): void {
    if (message.roomId !== this.roomId) return;
    this.flushQueue();
  }

  private upsertMember(member: PresenceMember): void {
    this.membersValue = [
      ...this.membersValue.filter((item) => item.userId !== member.userId),
      member,
    ];
    this.emit({ type: "presence", members: this.membersValue });
  }

  private removeMember(message: PresenceRemovedMessage): void {
    this.membersValue = this.membersValue.filter((item) => item.userId !== message.userId);
    this.emit({ type: "presence", members: this.membersValue });
  }

  private flushQueue(): void {
    if (this.socket?.readyState !== OPEN) return;
    while (this.queuedUpdates.length > 0) {
      this.socket.send(this.queuedUpdates.shift()!);
    }
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
    return `${protocol}//${window.location.hostname}:3001/ws/${this.roomId}`;
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

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}
