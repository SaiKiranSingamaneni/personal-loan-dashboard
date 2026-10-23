import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export function runMigrations(
  database: Database.Database,
  migrationsDirectory = resolve(process.cwd(), "apps/api/src/db/migrations"),
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const applied = database
    .prepare("SELECT name FROM schema_migrations")
    .all()
    .map((row) => (row as { name: string }).name);
  const addMigration = database.prepare(
    "INSERT INTO schema_migrations (name) VALUES (?)",
  );

  for (const name of readdirSync(migrationsDirectory).filter((entry) => entry.endsWith(".sql")).sort()) {
    if (applied.includes(name)) {
      continue;
    }
    const sql = readFileSync(resolve(migrationsDirectory, name), "utf8");
    database.transaction(() => {
      database.exec(sql);
      addMigration.run(name);
    })();
  }
}

export interface SqliteConnection {
  client: Database.Database;
  close(): void;
}

export function openSqliteDatabase(
  databasePath = process.env.DATABASE_PATH ?? "./data/loans.db",
): SqliteConnection {
  const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
  if (resolvedPath !== ":memory:") {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }
  const client = new Database(resolvedPath);
  try {
    client.pragma("foreign_keys = ON");
    client.pragma("journal_mode = WAL");
    runMigrations(client);
  } catch (error) {
    client.close();
    throw error;
  }
  return { client, close: () => client.close() };
}
