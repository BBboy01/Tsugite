import { eq } from "drizzle-orm";
import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";

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
  constructor(private readonly db: SQLiteBunDatabase) {}

  load(roomId: string): StoredRoom | undefined {
    const row = this.db.select().from(rooms).where(eq(rooms.roomId, roomId)).get();
    if (!row) return undefined;

    return {
      snapshot: row.snapshotBlob ?? decodeLegacySnapshot(row.snapshot),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  save(roomId: string, snapshot: Uint8Array, now = Date.now()): void {
    const snapshotBlob = Buffer.from(snapshot);
    this.db
      .insert(rooms)
      .values({ roomId, snapshot: null, snapshotBlob, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: rooms.roomId,
        set: { snapshot: null, snapshotBlob, updatedAt: now },
      })
      .run();
  }
}

function decodeLegacySnapshot(value: unknown): Uint8Array {
  const bytes: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !Array.isArray(bytes) ||
    !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error("Invalid persisted room snapshot");
  }
  return Uint8Array.from(bytes);
}
