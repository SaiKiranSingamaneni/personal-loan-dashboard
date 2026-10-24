import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { assertDiskSpace } from "./connection.js";
import { dirname, join, resolve } from "node:path";
import type Database from "better-sqlite3";
import { prepareSnapshotFile, snapshotIsRecentAndCurrent, tableCounts, verifySnapshot } from "./snapshotVerification.js";

const backupPattern = /^loans-\d{8}-\d{4}(?:-\d+)?\.db$/;

export class BackupService {
  readonly databasePath: string;
  readonly backupDirectory: string;

  constructor(
    private readonly database: Database.Database,
    databasePath: string,
    backupDirectory?: string,
  ) {
    if (databasePath === ":memory:") {
      throw new Error("File backups require a file-backed SQLite database");
    }
    this.databasePath = resolve(databasePath);
    this.backupDirectory = resolve(
      backupDirectory ?? join(dirname(dirname(this.databasePath)), "backups"),
    );
  }

  async create(now = new Date()): Promise<string> {
    mkdirSync(this.backupDirectory, { recursive: true });
    assertDiskSpace(this.databasePath, "database backup");
    const year = now.getUTCFullYear().toString().padStart(4, "0");
    const month = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const day = now.getUTCDate().toString().padStart(2, "0");
    const hour = now.getUTCHours().toString().padStart(2, "0");
    const minute = now.getUTCMinutes().toString().padStart(2, "0");
    const prefix = `loans-${year}${month}${day}-${hour}${minute}`;
    let filename = `${prefix}.db`;
    let suffix = 1;
    while (existsSync(join(this.backupDirectory, filename))) {
      filename = `${prefix}-${suffix}.db`;
      suffix += 1;
    }
    const target = join(this.backupDirectory, filename);
    const temporary = `${target}.${process.pid}.tmp`;
    const countsAtSnapshotStart = tableCounts(this.database);
    try {
      await this.database.backup(temporary);
      prepareSnapshotFile(temporary);
      verifySnapshot(temporary, countsAtSnapshotStart);
      renameSync(temporary, target);
    } catch (error) {
      try { rmSync(temporary, { force: true }); } catch { /* preserve the backup error */ }
      throw error;
    }

    const backups = readdirSync(this.backupDirectory)
      .filter((entry) => backupPattern.test(entry) && !entry.startsWith("pre-migration-"))
      .sort();
    for (const expired of backups.slice(0, Math.max(0, backups.length - 30))) {
      rmSync(join(this.backupDirectory, expired));
    }
    return target;
  }

  async createStartup(now = new Date()): Promise<string> {
    mkdirSync(this.backupDirectory, { recursive: true });
    const recent = readdirSync(this.backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && backupPattern.test(entry.name))
      .map((entry) => join(this.backupDirectory, entry.name))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
      .find((path) => snapshotIsRecentAndCurrent(path, this.databasePath, now));
    return recent ?? this.create(now);
  }
}
