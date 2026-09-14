import { eq } from "drizzle-orm";

import { db } from "../db/database";
import { rooms } from "../db/schema";

export type StoredRoom = {
  snapshot: Uint8Array;
  createdAt: number;
  updatedAt: number;
};

export type RoomStore = {
  load(roomId: string): StoredRoom | undefined;
  save(roomId: string, snapshot: Uint8Array, now?: number): void;
};

export class RoomRepository implements RoomStore {
  load(roomId: string): StoredRoom | undefined {
    const row = db.select().from(rooms).where(eq(rooms.roomId, roomId)).get();
    if (!row) return undefined;

    return {
      snapshot: Uint8Array.from(JSON.parse(String(row.snapshot)) as number[]),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  save(roomId: string, snapshot: Uint8Array, now = Date.now()): void {
    const encoded = JSON.stringify([...snapshot]);
    db.insert(rooms)
      .values({ roomId, snapshot: encoded, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: rooms.roomId,
        set: { snapshot: encoded, updatedAt: now },
      })
      .run();
  }
}
