import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readFileSync } from "node:fs";
import { LoroDoc } from "loro-crdt";

import { createProjectDoc, readSettings, setSharedSetting } from "@iris/shared";

import { RoomRepository } from "./room-repository";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function createDatabase() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  return { sqlite, db: drizzle({ client: sqlite }) };
}

test("migrates legacy double-encoded snapshots without losing room content", () => {
  const { sqlite, db } = createDatabase();
  sqlite.exec(readFileSync("drizzle/20260914033752_create_rooms/migration.sql", "utf8"));
  const document = createProjectDoc();
  setSharedSetting(document, "theme", "nord");
  const snapshot = document.export({ mode: "snapshot" });
  sqlite
    .query("INSERT INTO rooms VALUES (?, ?, ?, ?)")
    .run("legacy", JSON.stringify(JSON.stringify([...snapshot])), 100, 200);

  migrate(db, { migrationsFolder: "./drizzle" });
  migrate(db, { migrationsFolder: "./drizzle" });
  const repository = new RoomRepository(db);
  const stored = repository.load("legacy");
  expect(stored).toBeDefined();
  expect(stored?.createdAt).toBe(100);
  expect(stored?.updatedAt).toBe(200);
  const restored = new LoroDoc();
  restored.import(stored!.snapshot);
  expect(restored.toJSON()).toEqual(document.toJSON());
  expect(readSettings(restored).theme).toBe("nord");

  repository.save("legacy", snapshot, 300);
  expect(sqlite.query("SELECT snapshot, typeof(snapshot_blob) AS kind FROM rooms").get()).toEqual({
    snapshot: null,
    kind: "blob",
  });
  expect(repository.load("legacy")?.createdAt).toBe(100);
  expect(repository.load("legacy")?.updatedAt).toBe(300);
});

test("persists binary bytes and preserves creation time across updates", () => {
  const { sqlite, db } = createDatabase();
  migrate(db, { migrationsFolder: "./drizzle" });
  const repository = new RoomRepository(db);
  repository.save("binary", new Uint8Array([0, 127, 128, 255]), 123);
  expect(sqlite.query("SELECT room_id FROM rooms").get()).toEqual({ room_id: "binary" });
  expect(repository.load("binary")).toEqual({
    snapshot: new Uint8Array([0, 127, 128, 255]),
    createdAt: 123,
    updatedAt: 123,
  });
  repository.save("binary", new Uint8Array([255, 0]), 456);
  expect(repository.load("binary")).toEqual({
    snapshot: new Uint8Array([255, 0]),
    createdAt: 123,
    updatedAt: 456,
  });
  expect(repository.load("missing")).toBeUndefined();
});

test("does not silently coerce corrupt legacy snapshots into bytes", () => {
  const { sqlite, db } = createDatabase();
  migrate(db, { migrationsFolder: "./drizzle" });
  sqlite
    .query("INSERT INTO rooms (room_id, snapshot, created_at, updated_at) VALUES (?, ?, 0, 0)")
    .run("corrupt", JSON.stringify(JSON.stringify([0, 256, -1])));
  const repository = new RoomRepository(db);
  expect(() => repository.load("corrupt")).toThrow("Invalid persisted room snapshot");
});
