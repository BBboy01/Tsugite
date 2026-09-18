import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createRoomDatabase(databasePath: string) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath, { create: true });
  try {
    sqlite.run("PRAGMA journal_mode = WAL");
    sqlite.run("PRAGMA busy_timeout = 5000");
    const db = drizzle({ client: sqlite });
    migrate(db, { migrationsFolder: "./drizzle" });
    return { db, sqlite };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
