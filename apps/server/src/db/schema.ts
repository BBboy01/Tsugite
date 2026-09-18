import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  roomId: text("room_id").primaryKey(),
  snapshot: text("snapshot", { mode: "json" }),
  snapshotBlob: blob("snapshot_blob", { mode: "buffer" }),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export type RoomRow = typeof rooms.$inferSelect;
