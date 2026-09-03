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
  type JoinPayload,
  type PresencePayload,
} from "./room-schemas";

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
};

export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly clients = new Map<RoomSocket, RoomClient>();

  join(socket: RoomSocket, roomId: string, message: unknown): boolean {
    if (!isJoinPayload(message)) return false;

    const room = this.getOrCreate(roomId);
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
    const client = this.clients.get(socket);
    if (!client) return false;

    const room = this.rooms.get(client.roomId);
    if (!room) return false;

    try {
      room.doc.import(bytes);
    } catch {
      return false;
    }

    this.broadcast(room, bytes, socket);
    return true;
  }

  presence(socket: RoomSocket, message: unknown): boolean {
    if (!isPresencePayload(message)) return false;

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

    return true;
  }

  memberCount(roomId: string): number {
    return this.rooms.get(roomId)?.clients.size ?? 0;
  }

  getDocument(roomId: string): LoroDoc | undefined {
    return this.rooms.get(roomId)?.doc;
  }

  private getOrCreate(roomId: string): Room {
    const current = this.rooms.get(roomId);
    if (current) return current;

    const room: Room = { doc: createProjectDoc(), clients: new Map() };
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
