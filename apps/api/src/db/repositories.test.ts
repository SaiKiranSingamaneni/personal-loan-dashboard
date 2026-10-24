import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSqliteDatabase, runMigrations, type SqliteConnection } from "./connection.js";
import { createSqliteRepositories } from "./repositories.js";

describe("SQLite repositories", () => {
  let connection: SqliteConnection;
  let repositories: ReturnType<typeof createSqliteRepositories>;

  beforeEach(() => {
    connection = openSqliteDatabase(":memory:");
    repositories = createSqliteRepositories(connection.client);
  });

  afterEach(() => connection.close());

  function createLoan(id = "loan-1"): void {
    const timestamp = "2026-01-01T00:00:00.000Z";
    repositories.loans.create({
      id,
      name: "Test loan",
      lender: "Example lender",
      loanType: "home",
      status: "active",
      sanctionedAmount: 1_000_000,
      annualRatePercent: 8.5,
      rateType: "fixed",
      tenureMonths: 120,
      startDate: "2026-01-01",
      emiDueDay: 5,
      emiStartRule: "full-disbursement",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  it("runs versioned migrations once and exposes typed loan records", () => {
    runMigrations(connection.client);
    expect(
      connection.client.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 9 });
    createLoan();
    expect(repositories.loans.getById("loan-1")?.name).toBe("Test loan");
    expect(repositories.loans.listActive()).toHaveLength(1);
    const timestamp = "2026-01-01T00:00:00.000Z";
    repositories.children.propertyCosts.upsertMany([{
      id: "cost-1",
      loanId: "loan-1",
      name: "Base price",
      group: "AGREEMENT",
      kind: "BASE_PRICE",
      amount: 10_000,
      note: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }]);
    expect(repositories.children.propertyCosts.listByLoan("loan-1")[0]?.amount).toBe(10_000);
    const activity = repositories.children.activityEntries.create({
      id: "activity-1",
      loanId: "loan-1",
      type: "EXTRA_EMI",
      date: "2026-02-05",
      amount: 1000,
      title: "Extra payment",
      origin: "USER",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(activity.title).toBe("Extra payment");
  });

  it("supports soft delete, restore, and loan-scoped child lookup", () => {
    createLoan();
    const timestamp = "2026-01-01T00:00:00.000Z";
    repositories.children.payments.create({
      id: "payment-1",
      loanId: "loan-1",
      date: "2026-02-05",
      amount: 12_000,
      type: "emi",
      principalPart: 9_000,
      interestPart: 3_000,
      status: "paid",
      scheduledPeriod: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(repositories.children.payments.listByLoan("loan-1")).toHaveLength(1);
    expect(repositories.children.payments.softDelete("payment-1", timestamp)).toBe(true);
    expect(repositories.children.payments.listByLoan("loan-1")).toHaveLength(0);
    expect(repositories.children.payments.restore("payment-1")).toBe(true);
    expect(repositories.children.payments.getById("payment-1")?.status).toBe("paid");
  });

  it("increments record versions and rejects stale updates and deletes", () => {
    createLoan();
    const first = repositories.loans.getById("loan-1")!;
    expect(first.version).toBe(1);
    const updated = repositories.loans.update("loan-1", { name: "Renamed" }, first.version)!;
    expect(updated.version).toBe(2);
    expect(repositories.loans.update("loan-1", { name: "Stale overwrite" }, first.version)).toBeUndefined();
    expect(repositories.loans.softDelete("loan-1", "2026-02-01T00:00:00.000Z", first.version)).toBe(false);
    expect(repositories.loans.getById("loan-1")?.name).toBe("Renamed");
  });

  it("rolls back all repository writes when a transaction fails", () => {
    expect(() =>
      repositories.transaction(() => {
        createLoan();
        throw new Error("abort transaction");
      }),
    ).toThrow("abort transaction");
    expect(repositories.loans.list()).toHaveLength(0);
  });
});
