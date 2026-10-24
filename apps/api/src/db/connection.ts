import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { ensureDatabaseDirectories, resolveDatabasePaths } from "./paths.js";
import { prepareSnapshotFile, tableCounts, verifySnapshot } from "./snapshotVerification.js";
import { checkDatabaseIntegrity } from "./health.js";

const migrationsDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));

export async function runMigrations(
  database: Database.Database,
  migrationsPath = migrationsDirectory,
  backupDirectory = join(dirname(database.name), "backups"),
): Promise<void> {
  const migrationTableExists = database.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get() !== undefined;
  const applied = migrationTableExists
    ? database.prepare("SELECT name FROM schema_migrations").all().map((row) => (row as { name: string }).name)
    : [];
  applied.sort();

  const pending = readdirSync(migrationsPath).filter((entry) => entry.endsWith(".sql") && !applied.includes(entry)).sort();
  if (pending.length > 0 && database.name !== ":memory:") {
    await createPreMigrationSnapshot(database, backupDirectory, applied.at(-1) ?? "none");
  }

  for (const name of pending) {
    const sql = readFileSync(resolve(migrationsPath, name), "utf8");
    assertDiskSpace(database.name, `migration ${name}`);
    database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY NOT NULL,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      database.exec(sql);
      database.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
      if (name === "0005_activity_and_property_costs.sql" || name === "0008_property_three_tier_costs.sql") {
        const violations = database.pragma("foreign_key_check") as Record<string, unknown>[];
        if (violations.length > 0) throw new Error(`Migration ${name} failed foreign_key_check: ${JSON.stringify(violations)}`);
      }
    }).immediate();
  }
  if (pending.length === 0 && !migrationTableExists) {
    database.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  }
}

async function createPreMigrationSnapshot(database: Database.Database, backupDirectory: string, schemaVersion: string): Promise<string> {
  assertDiskSpace(database.name, "pre-migration snapshot");
  const now = new Date();
  const stamp = `${now.getUTCFullYear().toString().padStart(4, "0")}${(now.getUTCMonth() + 1).toString().padStart(2, "0")}${now.getUTCDate().toString().padStart(2, "0")}-${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes().toString().padStart(2, "0")}${now.getUTCSeconds().toString().padStart(2, "0")}`;
  const target = join(backupDirectory, `pre-migration-${stamp}-${schemaVersion}.db`);
  const temporary = `${target}.${process.pid}.tmp`;
  const sourceCounts = tableCounts(database);
  try {
    mkdirSync(backupDirectory, { recursive: true });
    await database.backup(temporary);
    prepareSnapshotFile(temporary);
    verifySnapshot(temporary, sourceCounts);
    renameSync(temporary, target);
    return target;
  } catch (error) {
    try { rmSync(temporary, { force: true }); } catch { /* preserve the snapshot error */ }
    throw new Error(`Pre-migration snapshot failed; migration was aborted: ${String(error)}`);
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
  startupFailures: string[];
  close(): void;
}

export async function openSqliteDatabase(
  databasePath?: string,
): Promise<SqliteConnection> {
  const resolvedPath = databasePath === ":memory:"
    ? databasePath
    : resolve(databasePath ?? resolveDatabasePaths().databasePath);
  if (databasePath === undefined) ensureDatabaseDirectories(resolveDatabasePaths());
  const isFirstDatabaseFile = resolvedPath !== ":memory:" && !existsSync(resolvedPath);
  if (!isFirstDatabaseFile && resolvedPath !== ":memory:") {
    const inspection = new Database(resolvedPath, { readonly: true, fileMustExist: true });
    const failures = checkDatabaseIntegrity(inspection);
    if (failures.length > 0) {
      return { client: inspection, databasePath: resolvedPath, startupFailures: failures, close: () => inspection.close() };
    }
    inspection.close();
  }
  const client = new Database(resolvedPath);
  try {
    client.pragma("foreign_keys = ON");
    client.pragma("journal_mode = WAL");
    client.pragma("synchronous = FULL");
    client.pragma("busy_timeout = 5000");
    const backupDirectory = databasePath === undefined
      ? resolveDatabasePaths().backupsDirectory
      : join(dirname(resolvedPath), "backups");
    await runMigrations(client, migrationsDirectory, backupDirectory);
    if (isFirstDatabaseFile) process.stdout.write(`Created database file ${resolvedPath}\n`);
  } catch (error) {
    client.close();
    throw error;
  }
  return { client, databasePath: resolvedPath, startupFailures: [], close: () => client.close() };
}
