import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const databasePath = Bun.env.DATABASE_PATH ?? "./data/tsugite.sqlite";
mkdirSync(dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath, { create: true });
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA busy_timeout = 5000");

export const db = drizzle({ client: sqlite });
migrate(db, { migrationsFolder: "./drizzle" });
