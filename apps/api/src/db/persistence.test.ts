import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase, type SqliteConnection } from "./connection.js";
import { createSqliteRepositories } from "./repositories.js";
import { acquireDatabaseLock } from "./paths.js";
import { readFileSync, writeFileSync } from "node:fs";

describe("SQLite persistence", () => {
  let directory: string;
  let connection: SqliteConnection | undefined;

  afterEach(() => {
    connection?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("applies the required durability pragmas on every connection", async () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-pragmas-"));
    connection = await openSqliteDatabase(join(directory, "loans.db"));
    expect(connection.client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(connection.client.pragma("synchronous", { simple: true })).toBe(2);
    expect(connection.client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(connection.client.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("refuses a live database lock and clears a stale PID lock", () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-lock-"));
    const release = acquireDatabaseLock(directory);
    expect(() => acquireDatabaseLock(directory)).toThrow(/owns the database lock/);
    release();
    writeFileSync(join(directory, ".lock"), "999999999\n");
    const releaseRecovered = acquireDatabaseLock(directory);
    expect(Number(readFileSync(join(directory, ".lock"), "utf8").trim())).toBe(process.pid);
    releaseRecovered();
  });

  it("keeps loan records after closing and reopening the database file", async () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-persistence-"));
    const databasePath = join(directory, "loans.db");
    connection = await openSqliteDatabase(databasePath);
    const repositories = createSqliteRepositories(connection.client);
    repositories.loans.create({
      id: "persistent-loan",
      name: "Persistent home loan",
      lender: "Example Bank",
      loanType: "home",
      accountReference: null,
      status: "active",
      sanctionedAmount: 5_000_000,
      annualRatePercent: 8.5,
      rateType: "fixed",
      tenureMonths: 240,
      startDate: "2026-10-01",
      emiDueDay: 5,
      emiOverride: null,
      processingFee: null,
      otherCharges: null,
      propertyCost: null,
      emiStartRule: "full-disbursement",
      emiStartDate: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: "2026-10-23T00:00:00.000Z",
      updatedAt: "2026-10-23T00:00:00.000Z",
    });

    connection.close();
    connection = await openSqliteDatabase(databasePath);
    const restored = createSqliteRepositories(connection.client).loans.getById("persistent-loan");

    expect(restored?.name).toBe("Persistent home loan");
    expect(restored?.sanctionedAmount).toBe(5_000_000);
  });
});
