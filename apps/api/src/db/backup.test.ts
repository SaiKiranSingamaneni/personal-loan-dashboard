import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase } from "./connection.js";
import { BackupService } from "./backup.js";
import { initializeApi } from "../server.js";
import { verifySnapshot } from "./snapshotVerification.js";

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
    const connection = await openSqliteDatabase(databasePath);
    try {
      const backupDirectory = join(directory, "backups");
      mkdirSync(backupDirectory, { recursive: true });
      for (let index = 0; index < 32; index += 1) {
        const stamp = `${(2020 + index).toString()}0101-0000`;
        writeFileSync(join(backupDirectory, `loans-${stamp}.db`), "old-backup");
      }
      const protectedPath = join(backupDirectory, "pre-migration-20260101-000000-0008_property.db");
      writeFileSync(protectedPath, "protected snapshot placeholder");
      const service = new BackupService(connection.client, databasePath, backupDirectory);
      const backupPath = await service.create(new Date("2035-06-07T08:09:00.000Z"));
      expect(backupPath).toBe(join(backupDirectory, "loans-20350607-0809.db"));
      expect(existsSync(backupPath)).toBe(true);
      verifySnapshot(backupPath);
      const backups = readdirSync(backupDirectory).filter((name) => name.startsWith("loans-") && name.endsWith(".db"));
      expect(backups).toHaveLength(30);
      expect(backups).toContain("loans-20350607-0809.db");
      expect(existsSync(protectedPath)).toBe(true);
    } finally {
      connection.close();
    }
  });

  it("creates a startup backup before returning the API runtime", async () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-startup-backup-"));
    const databasePath = join(directory, "loans.db");
    const backupDirectory = join(directory, "backups");
    const runtime = await initializeApi(databasePath, backupDirectory);
    try {
      expect(readdirSync(backupDirectory).filter((name) => name.startsWith("loans-") && name.endsWith(".db"))).toHaveLength(1);
      expect(readdirSync(backupDirectory).filter((name) => name.startsWith("pre-migration-") && name.endsWith(".db"))).toHaveLength(1);
      for (const name of readdirSync(backupDirectory).filter((entry) => entry.startsWith("pre-migration-") && entry.endsWith(".db"))) {
        verifySnapshot(join(backupDirectory, name));
      }
      expect(runtime.app).toBeDefined();
    } finally {
      runtime.close();
    }
  });

  it("skips a verified current startup snapshot and puts default backups beside the data directory", async () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-startup-dedup-"));
    const databasePath = join(directory, "db", "data", "loans.db");
    mkdirSync(join(directory, "db", "data"), { recursive: true });
    const connection = await openSqliteDatabase(databasePath);
    try {
      const service = new BackupService(connection.client, databasePath);
      expect(service.backupDirectory).toBe(join(directory, "db", "backups"));
      const first = await service.createStartup();
      const second = await service.createStartup(new Date(Date.now() + 1000));
      expect(second).toBe(first);
      expect(readdirSync(service.backupDirectory).filter((name) => name.startsWith("loans-") && name.endsWith(".db")).length).toBe(1);
    } finally {
      connection.close();
    }
  });
});
