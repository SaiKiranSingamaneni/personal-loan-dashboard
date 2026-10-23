import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase, type SqliteConnection } from "./connection.js";
import { createSqliteRepositories } from "./repositories.js";

describe("SQLite persistence", () => {
  let directory: string;
  let connection: SqliteConnection | undefined;

  afterEach(() => {
    connection?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps loan records after closing and reopening the database file", () => {
    directory = mkdtempSync(join(tmpdir(), "loan-dashboard-persistence-"));
    const databasePath = join(directory, "loans.db");
    connection = openSqliteDatabase(databasePath);
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
    connection = openSqliteDatabase(databasePath);
    const restored = createSqliteRepositories(connection.client).loans.getById("persistent-loan");

    expect(restored?.name).toBe("Persistent home loan");
    expect(restored?.sanctionedAmount).toBe(5_000_000);
  });
});
