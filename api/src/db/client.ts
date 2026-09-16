import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export function createDb(databasePath: string): { db: AppDatabase; close: () => void } {
  if (databasePath !== ":memory:") {
    const dir = dirname(databasePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(databasePath);

  if (databasePath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  // SQLite disables foreign-key enforcement per connection by default, so the
  // cascade rules on sessions.user_id/balances.user_id are inert without
  // this. Applies to :memory: too, so tests exercise the same behavior.
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Migrations run synchronously here, before the caller can start listening,
  // so `npm run dev` starting web/api in parallel never races an unmigrated DB.
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db,
    close: () => sqlite.close(),
  };
}
