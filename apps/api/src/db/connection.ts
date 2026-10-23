import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const migrationsDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));

export function runMigrations(
  database: Database.Database,
  migrationsPath = migrationsDirectory,
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

  for (const name of readdirSync(migrationsPath).filter((entry) => entry.endsWith(".sql")).sort()) {
    if (applied.includes(name)) {
      continue;
    }
    const sql = readFileSync(resolve(migrationsPath, name), "utf8");
    database.transaction(() => {
      database.exec(sql);
      addMigration.run(name);
    })();
  }
}

export interface SqliteConnection {
  client: Database.Database;
  databasePath: string;
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
  return { client, databasePath: resolvedPath, close: () => client.close() };
}
