import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

import { decodeJsonMessage, encodeJsonMessage } from "@iris/shared";

import {
  RoomService,
  isJoinMessage,
  isPresenceMessage,
  type RoomSocket,
} from "./rooms/room-service";
import { ROOM_LIMITS, WindowRateLimit } from "./rooms/room-limits";
import { isRoomId } from "./rooms/room-schemas";

type RoomAppOptions = {
  maxConnections?: number;
  maxPayloadLength?: number;
  joinTimeoutMs?: number;
  messagesPerSecond?: number;
};

export function createRoomApp(rooms: RoomService, options: RoomAppOptions = {}) {
  const connections = new Map<
    RoomSocket,
    { timer: ReturnType<typeof setTimeout>; messages: WindowRateLimit }
  >();
  return new Elysia({
    websocket: {
      maxPayloadLength: options.maxPayloadLength ?? ROOM_LIMITS.maxUpdateBytes,
      backpressureLimit: 4 * 1024 * 1024,
      closeOnBackpressureLimit: true,
    },
  })
    .use(cors({ origin: true }))
    .get("/health", () => ({ ok: true }))
    .onStop(() => {
      for (const connection of connections.values()) clearTimeout(connection.timer);
      connections.clear();
    })
    .ws("/ws/:roomId", {
      beforeHandle({ params, status }) {
        if (!isRoomId(params.roomId)) return status(400, "Invalid room identifier");
      },
      open(ws) {
        if (connections.size >= (options.maxConnections ?? ROOM_LIMITS.maxClients)) {
          ws.close(1013, "Connection capacity reached");
          return;
        }
        const timer = setTimeout(
          () => ws.close(1008, "Room join timed out"),
          options.joinTimeoutMs ?? 10_000,
        );
        timer.unref();
        connections.set(ws.raw, {
          timer,
          messages: new WindowRateLimit(options.messagesPerSecond ?? 120, 1000),
        });
      },
      message(ws, message) {
        const roomId = ws.data.params.roomId;
        const socket = ws.raw;
        const connection = connections.get(socket);
        if (!connection || !connection.messages.consume()) {
          ws.close(1008, "Message rate exceeded");
          return;
        }
        try {
          let accepted = false;
          if (message instanceof Uint8Array) {
            accepted = rooms.update(socket, message);
            if (accepted) socket.send(encodeJsonMessage({ type: "update:ack" }));
          } else {
            const payload = typeof message === "string" ? decodeJsonMessage(message) : message;
            if (isJoinMessage(payload)) {
              accepted = rooms.join(socket, roomId, payload);
              if (accepted) clearTimeout(connection.timer);
            } else if (isPresenceMessage(payload)) {
              accepted = rooms.presence(socket, payload);
            }
          }
          if (!accepted) ws.close(1008, "Room message rejected");
        } catch (error) {
          console.error("Room operation failed", { roomId, error });
          ws.close(1011, "Room unavailable");
        }
      },
      close(ws) {
        clearTimeout(connections.get(ws.raw)?.timer);
        connections.delete(ws.raw);
        rooms.leave(ws.raw);
      },
    });
}
