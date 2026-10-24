import { existsSync, readdirSync, statSync, statfsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { verifySnapshot } from "./snapshotVerification.js";

export interface DatabaseHealthState {
  dbPath: string;
  dbOk: boolean;
  lastIntegrityCheck: string | null;
  lastBackupAt: string | null;
  lastBackupVerified: boolean;
  mirrorConfigured: boolean;
  mirrorOk: boolean;
  diskFreeMb: number | null;
  warnings: string[];
  failures: string[];
}

export function checkDatabaseIntegrity(database: Database.Database): string[] {
  const failures: string[] = [];
  try {
    const quickCheck = database.pragma("quick_check") as { quick_check: string }[];
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== "ok") {
      failures.push(`PRAGMA quick_check failed: ${JSON.stringify(quickCheck)}`);
    }
  } catch (error) {
    failures.push(`PRAGMA quick_check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const foreignKeyCheck = database.pragma("foreign_key_check") as Record<string, unknown>[];
    if (foreignKeyCheck.length > 0) failures.push(`PRAGMA foreign_key_check found violations: ${JSON.stringify(foreignKeyCheck)}`);
  } catch (error) {
    failures.push(`PRAGMA foreign_key_check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

function latestVerifiedBackup(directory: string): { at: string; verified: boolean } | null {
  if (!existsSync(directory)) return null;
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".db") && !name.includes(".tmp"))
    .map((name) => join(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  const candidate = candidates[0];
  if (candidate === undefined) return null;
  try {
    verifySnapshot(candidate);
    return { at: statSync(candidate).mtime.toISOString(), verified: true };
  } catch {
    return { at: statSync(candidate).mtime.toISOString(), verified: false };
  }
}

export function inspectDatabaseHealth(
  database: Database.Database,
  dbPath: string,
  backupDirectory: string,
): DatabaseHealthState {
  const now = new Date().toISOString();
  const failures = checkDatabaseIntegrity(database);
  const warnings: string[] = [];
  let latestBackup: ReturnType<typeof latestVerifiedBackup> = null;
  try {
    latestBackup = latestVerifiedBackup(backupDirectory);
  } catch (error) {
    warnings.push(`Could not inspect backups: ${error instanceof Error ? error.message : String(error)}`);
  }
  let diskFreeMb: number | null = null;
  try {
    const filesystem = statfsSync(dirname(resolve(dbPath)));
    diskFreeMb = Math.floor(filesystem.bavail * filesystem.bsize / (1024 * 1024));
  } catch (error) {
    warnings.push(`Could not inspect free disk space: ${error instanceof Error ? error.message : String(error)}`);
  }
  const mirrorConfigured = Boolean(process.env.BACKUP_MIRROR_DIR?.trim());
  if (!mirrorConfigured) warnings.push("No off-disk copy configured.");
  if (latestBackup === null || !latestBackup.verified) warnings.push("No verified backup is available.");
  if (diskFreeMb !== null && diskFreeMb < 500) warnings.push(`Only ${diskFreeMb} MB of disk space remains.`);
  return {
    dbPath,
    dbOk: failures.length === 0,
    lastIntegrityCheck: now,
    lastBackupAt: latestBackup?.at ?? null,
    lastBackupVerified: latestBackup?.verified ?? false,
    mirrorConfigured,
    mirrorOk: false,
    diskFreeMb,
    warnings,
    failures,
  };
}
