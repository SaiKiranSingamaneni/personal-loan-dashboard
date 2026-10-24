import { existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export type TableCounts = Record<string, number>;

export function tableCounts(database: Database.Database): TableCounts {
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => [
    name,
    (database.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get() as { count: number }).count,
  ]));
}

export function verifySnapshot(snapshotPath: string, expectedCounts?: TableCounts): TableCounts {
  if (!existsSync(snapshotPath)) throw new Error(`Snapshot file was not created: ${snapshotPath}`);
  const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    const integrity = snapshot.pragma("integrity_check") as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new Error(`Snapshot integrity_check failed: ${JSON.stringify(integrity)}`);
    }
    const actualCounts = tableCounts(snapshot);
    if (expectedCounts !== undefined && JSON.stringify(actualCounts) !== JSON.stringify(expectedCounts)) {
      throw new Error(`Snapshot row counts do not match the source. Expected ${JSON.stringify(expectedCounts)}, got ${JSON.stringify(actualCounts)}.`);
    }
    return actualCounts;
  } finally {
    snapshot.close();
  }
}

export function prepareSnapshotFile(snapshotPath: string): void {
  const snapshot = new Database(snapshotPath);
  try {
    snapshot.pragma("journal_mode = DELETE");
    snapshot.pragma("synchronous = FULL");
  } finally {
    snapshot.close();
  }
}

function logicalDigest(database: Database.Database): string {
  const tables = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as { name: string }[];
  const content = tables.map(({ name }) => {
    const escaped = name.replaceAll('"', '""');
    const rows = database.prepare(`SELECT * FROM "${escaped}" ORDER BY rowid`).all();
    return [name, rows];
  });
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function snapshotIsRecentAndCurrent(
  snapshotPath: string,
  sourcePath: string,
  now: Date,
  maxAgeMs = 10 * 60 * 1000,
): boolean {
  if (!existsSync(snapshotPath)) return false;
  const snapshotStat = statSync(snapshotPath);
  const age = now.getTime() - snapshotStat.mtimeMs;
  if (age < 0 || age > maxAgeMs) return false;
  try {
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
      verifySnapshot(snapshotPath, tableCounts(source));
      const saved = new Database(snapshotPath, { readonly: true, fileMustExist: true });
      try {
        return logicalDigest(source) === logicalDigest(saved);
      } finally {
        saved.close();
      }
    } finally {
      source.close();
    }
  } catch {
    return false;
  }
}
