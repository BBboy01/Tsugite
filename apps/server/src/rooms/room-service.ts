import { LoroDoc } from "loro-crdt";

import {
  createProjectDoc,
  type PresenceListMessage,
  type PresenceMember,
  type PresenceMessage,
  type PresenceRemovedMessage,
  type ServerReadyMessage,
} from "@iris/shared";

import {
  isJoinPayload,
  isPresencePayload,
  isRoomId,
  type JoinPayload,
  type PresencePayload,
} from "./room-schemas";
import type { RoomStore } from "./room-repository";
import { RoomPersistence } from "./room-persistence";
import { ROOM_LIMITS, WindowRateLimit } from "./room-limits";

export type RoomSocket = {
  send: (data: string | Uint8Array) => unknown;
  sendBinary?: (data: Uint8Array) => unknown;
};

type RoomClient = {
  roomId: string;
  socket: RoomSocket;
  presence: PresenceMember;
};

type Room = {
  doc: LoroDoc;
  clients: Map<string, RoomClient>;
  evictionTimer?: ReturnType<typeof setTimeout>;
};

type RoomServiceOptions = Partial<typeof ROOM_LIMITS> & {
  saveDelayMs?: number;
  idleTtlMs?: number;
  onPersistenceError?: (roomId: string, error: unknown) => void;
  now?: () => number;
};

export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly clients = new Map<RoomSocket, RoomClient>();

  private readonly persistence: RoomPersistence;
  private readonly idleTtlMs: number;
  private stopped = false;
  private readonly limits: typeof ROOM_LIMITS;
  private readonly roomCreations: WindowRateLimit;

  constructor(
    private readonly repository: RoomStore,
    options: RoomServiceOptions = {},
  ) {
    this.limits = { ...ROOM_LIMITS, ...options };
    this.roomCreations = new WindowRateLimit(
      this.limits.roomCreationLimit,
      this.limits.roomCreationWindowMs,
      options.now,
    );
    this.idleTtlMs = options.idleTtlMs ?? 5 * 60_000;
    this.persistence = new RoomPersistence(
      options.saveDelayMs ?? 500,
      options.onPersistenceError ??
        ((roomId, error) => console.error("Room snapshot save failed", { roomId, error })),
    );
  }

  join(socket: RoomSocket, roomId: string, message: unknown): boolean {
    if (this.stopped || !isRoomId(roomId) || !isJoinPayload(message)) return false;
    const boundClient = this.clients.get(socket);
    if (boundClient) {
      return boundClient.roomId === roomId && boundClient.presence.userId === message.userId;
    }

    if (this.clients.size >= this.limits.maxClients) return false;
    const room = this.getOrCreate(roomId);
    if (!room) return false;
    if (room.clients.size >= this.limits.maxMembers && !room.clients.has(message.userId))
      return false;
    clearTimeout(room.evictionTimer);
    room.evictionTimer = undefined;
    const presence: PresenceMember = {
      userId: message.userId,
      displayName: message.displayName.trim(),
      color: message.color,
      selectedPath: null,
      cursor: null,
    };
    const client: RoomClient = { roomId, socket, presence };

    const existing = room.clients.get(presence.userId);
    if (existing) {
      this.clients.delete(existing.socket);
      room.clients.delete(presence.userId);
    }

    room.clients.set(presence.userId, client);
    this.clients.set(socket, client);

    const ready: ServerReadyMessage = { type: "ready", roomId };
    socket.send(JSON.stringify(ready));
    sendBinary(socket, room.doc.export({ mode: "snapshot" }));

    const list: PresenceListMessage = {
      type: "presence:list",
      members: [...room.clients.values()].map(({ presence: member }) => member),
    };
    socket.send(JSON.stringify(list));

    const joined: PresenceMessage = { type: "presence", ...presence };
    this.broadcast(room, JSON.stringify(joined), socket);
    return true;
  }

  update(socket: RoomSocket, bytes: Uint8Array): boolean {
    if (this.stopped || bytes.byteLength === 0 || bytes.byteLength > this.limits.maxUpdateBytes) {
      return false;
    }
    const client = this.clients.get(socket);
    if (!client) return false;

    const room = this.rooms.get(client.roomId);
    if (!room) return false;

    try {
      room.doc.import(bytes);
    } catch {
      return false;
    }

    this.persistence.schedule(client.roomId, () =>
      this.repository.save(client.roomId, room.doc.export({ mode: "snapshot" })),
    );
    this.broadcast(room, bytes, socket);
    return true;
  }

  presence(socket: RoomSocket, message: unknown): boolean {
    if (this.stopped || !isPresencePayload(message)) return false;

    const client = this.clients.get(socket);
    if (!client || client.presence.userId !== message.userId) return false;

    const nextPresence: PresenceMember = {
      userId: message.userId,
      displayName: message.displayName.trim(),
      color: message.color,
      selectedPath: message.selectedPath,
      cursor: message.cursor,
    };
    client.presence = nextPresence;

    const room = this.rooms.get(client.roomId);
    if (!room) return false;

    const update: PresenceMessage = { type: "presence", ...nextPresence };
    this.broadcast(room, JSON.stringify(update), socket);
    return true;
  }

  leave(socket: RoomSocket): boolean {
    const client = this.clients.get(socket);
    if (!client) return false;

    const room = this.rooms.get(client.roomId);
    this.clients.delete(socket);
    room?.clients.delete(client.presence.userId);

    if (!room) return true;

    const removed: PresenceRemovedMessage = {
      type: "presence:removed",
      userId: client.presence.userId,
    };
    this.broadcast(room, JSON.stringify(removed), socket);

    if (room.clients.size === 0) {
      this.persistence.flush(client.roomId);
      if (!this.stopped) this.scheduleEviction(client.roomId, room);
    }

    return true;
  }

  memberCount(roomId: string): number {
    return this.rooms.get(roomId)?.clients.size ?? 0;
  }

  getDocument(roomId: string): LoroDoc | undefined {
    return this.rooms.get(roomId)?.doc;
  }

  shutdown(): boolean {
    this.stopped = true;
    for (const room of this.rooms.values()) clearTimeout(room.evictionTimer);
    return this.persistence.flushAll();
  }

  private scheduleEviction(roomId: string, room: Room): void {
    clearTimeout(room.evictionTimer);
    room.evictionTimer = setTimeout(() => {
      if (room.clients.size > 0) return;
      if (this.persistence.flush(roomId)) {
        this.rooms.delete(roomId);
      } else {
        this.scheduleEviction(roomId, room);
      }
    }, this.idleTtlMs);
    room.evictionTimer.unref();
  }

  private getOrCreate(roomId: string): Room | undefined {
    const current = this.rooms.get(roomId);
    if (current) return current;
    if (this.rooms.size >= this.limits.maxRooms) return undefined;

    const doc = new LoroDoc();
    const stored = this.repository.load(roomId);
    if (stored) doc.import(stored.snapshot);
    else {
      if (!this.roomCreations.consume()) return undefined;
      const initial = createProjectDoc();
      doc.import(initial.export({ mode: "snapshot" }));
      this.repository.save(roomId, doc.export({ mode: "snapshot" }));
    }
    const room: Room = { doc, clients: new Map() };
    this.rooms.set(roomId, room);
    return room;
  }

  private broadcast(room: Room, data: string | Uint8Array, excluded?: RoomSocket): void {
    for (const client of room.clients.values()) {
      if (client.socket === excluded) continue;
      if (typeof data === "string") client.socket.send(data);
      else sendBinary(client.socket, data);
    }
  }
}

function sendBinary(socket: RoomSocket, bytes: Uint8Array): void {
  if (socket.sendBinary) {
    socket.sendBinary(bytes);
    return;
  }
  socket.send(bytes);
}

export function isJoinMessage(value: unknown): value is JoinPayload {
  return isJoinPayload(value);
}

export function isPresenceMessage(value: unknown): value is PresencePayload {
  return isPresencePayload(value);
}
