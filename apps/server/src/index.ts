import { RoomService } from "./rooms/room-service";
import { RoomRepository } from "./rooms/room-repository";
import { createRoomDatabase } from "./db/database";
import { createRoomApp } from "./room-app";

const port = Number(Bun.env.PORT ?? 3001);
const { db, sqlite } = createRoomDatabase(Bun.env.DATABASE_PATH ?? "./data/tsugite.sqlite");
const rooms = new RoomService(new RoomRepository(db));

const app = createRoomApp(rooms).listen(port);

console.log(`Tsugite server listening on http://127.0.0.1:${app.server!.port}`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Shutdown owns the retry deadline; SQLite must not add a wait to every attempt.
  sqlite.run("PRAGMA busy_timeout = 0");
  let saved = rooms.shutdown();
  await app.stop(true);
  const retryDelayMs = 500;
  const maxRetries = 10;
  for (let attempt = 0; !saved && attempt < maxRetries; attempt++) {
    await Bun.sleep(retryDelayMs);
    saved = rooms.shutdown();
  }
  if (!saved) console.error("Shutdown failed to persist all room snapshots");
  sqlite.close();
  process.exit(saved ? 0 : 1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().catch((error) => {
      console.error("Server shutdown failed", error);
      process.exit(1);
    });
  });
}
