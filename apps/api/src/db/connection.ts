import { existsSync, readdirSync, readFileSync, statfsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { ensureDatabaseDirectories, resolveDatabasePaths } from "./paths.js";

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
    assertDiskSpace(database.name, `migration ${name}`);
    database.transaction(() => {
      database.exec(sql);
      addMigration.run(name);
    }).immediate();
  }
}

export function assertDiskSpace(databasePath: string, operation: string): number {
  if (databasePath === ":memory:") return Number.MAX_SAFE_INTEGER;
  const stats = statfsSync(resolve(databasePath).replace(/[\\/][^\\/]+$/, ""));
  const freeMb = Math.floor(stats.bavail * stats.bsize / (1024 * 1024));
  if (freeMb < 500) process.stderr.write(`Warning: only ${freeMb} MB free before ${operation}.\n`);
  return freeMb;
}

export interface SqliteConnection {
  client: Database.Database;
  databasePath: string;
  close(): void;
}

export function openSqliteDatabase(
  databasePath?: string,
): SqliteConnection {
  const resolvedPath = databasePath === ":memory:"
    ? databasePath
    : resolve(databasePath ?? resolveDatabasePaths().databasePath);
  if (databasePath === undefined) ensureDatabaseDirectories(resolveDatabasePaths());
  const isFirstDatabaseFile = resolvedPath !== ":memory:" && !existsSync(resolvedPath);
  const client = new Database(resolvedPath);
  try {
    client.pragma("foreign_keys = ON");
    client.pragma("journal_mode = WAL");
    client.pragma("synchronous = FULL");
    client.pragma("busy_timeout = 5000");
    runMigrations(client);
    if (isFirstDatabaseFile) process.stdout.write(`Created database file ${resolvedPath}\n`);
  } catch (error) {
    client.close();
    throw error;
  }
  return { client, databasePath: resolvedPath, close: () => client.close() };
}
