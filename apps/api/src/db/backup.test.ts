import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase } from "./connection.js";
import { BackupService } from "./backup.js";

describe("SQLite backup service", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("creates a SQLite backup and retains only the latest 30", async () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-backup-"));
    const databasePath = join(directory, "loans.db");
    const connection = openSqliteDatabase(databasePath);
    try {
      const backupDirectory = join(directory, "backups");
      mkdirSync(backupDirectory);
      for (let index = 0; index < 32; index += 1) {
        const stamp = `${(2020 + index).toString()}0101-0000`;
        writeFileSync(join(backupDirectory, `loans-${stamp}.db`), "old-backup");
      }
      const service = new BackupService(connection.client, databasePath, backupDirectory);
      const backupPath = await service.create(new Date("2035-06-07T08:09:00.000Z"));
      expect(backupPath).toBe(join(backupDirectory, "loans-20350607-0809.db"));
      expect(existsSync(backupPath)).toBe(true);
      const backups = readdirSync(backupDirectory).filter((name) => name.endsWith(".db"));
      expect(backups).toHaveLength(30);
      expect(backups).toContain("loans-20350607-0809.db");
    } finally {
      connection.close();
    }
  });
});
