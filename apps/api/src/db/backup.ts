import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { assertDiskSpace } from "./connection.js";
import { dirname, join, resolve } from "node:path";
import type Database from "better-sqlite3";

const backupPattern = /^loans-\d{8}-\d{4}\.db$/;

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
      backupDirectory ?? join(dirname(this.databasePath), "backups"),
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
    const filename = `loans-${year}${month}${day}-${hour}${minute}.db`;
    const target = join(this.backupDirectory, filename);
    await this.database.backup(target);

    const backups = readdirSync(this.backupDirectory)
      .filter((entry) => backupPattern.test(entry))
      .sort();
    for (const expired of backups.slice(0, Math.max(0, backups.length - 30))) {
      rmSync(join(this.backupDirectory, expired));
    }
    return target;
  }
}
