import cors from "@elysiajs/cors";
import { Elysia } from "elysia";

import { decodeJsonMessage } from "@iris/shared";

import { RoomService, isJoinMessage, isPresenceMessage } from "./rooms/room-service";

const port = Number(Bun.env.PORT ?? 3001);
const rooms = new RoomService();

new Elysia()
  .use(cors({ origin: true }))
  .get("/health", () => ({ ok: true }))
  .ws("/ws/:roomId", {
    open() {},
    message(ws, message) {
      const roomId = ws.data.params.roomId;
      const socket = ws.raw;

      const payload =
        typeof message === "string"
          ? decodeJsonMessage(message)
          : message instanceof Uint8Array
            ? decodeJsonMessage(new TextDecoder().decode(message))
            : message;
      if (isJoinMessage(payload)) {
        rooms.join(socket, roomId, payload);
      } else if (isPresenceMessage(payload)) {
        rooms.presence(socket, payload);
      } else if (message instanceof Uint8Array) {
        rooms.update(socket, message);
      }
    },
    close(ws) {
      rooms.leave(ws.raw);
    },
  })
  .listen(port);

console.log(`Tsugite server listening on http://127.0.0.1:${port}`);
