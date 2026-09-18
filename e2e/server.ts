import { createRoomDatabase } from "../apps/server/src/db/database";
import { createRoomApp } from "../apps/server/src/room-app";
import { RoomRepository } from "../apps/server/src/rooms/room-repository";
import { RoomService } from "../apps/server/src/rooms/room-service";

const { db, sqlite } = createRoomDatabase(":memory:");
const rooms = new RoomService(new RoomRepository(db), {
  maxRooms: 1024,
  roomCreationLimit: 1024,
  idleTtlMs: 1000,
});
const app = createRoomApp(rooms).listen({ hostname: "127.0.0.1", port: 3003 });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const saved = rooms.shutdown();
  await app.stop(true);
  sqlite.close();
  process.exit(saved ? 0 : 1);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
