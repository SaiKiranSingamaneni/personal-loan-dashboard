import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { runMigrations } from "./connection.js";
import { seedDemoData } from "./seed.js";

describe("initial SQLite schema and demo seed", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("creates all loan entities and seeds two related demo loans idempotently", async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    await runMigrations(db);
    expect(seedDemoData(db)).toBe(true);
    expect(seedDemoData(db)).toBe(false);
    expect(db.prepare("SELECT COUNT(*) AS count FROM loans").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM disbursements").get()).toEqual({
      count: 2,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM contributions").get()).toEqual({
      count: 2,
    });
    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tableNames).toEqual([
      "activity_entries",
      "contributions",
      "disbursements",
      "loans",
      "notes",
      "payments",
      "property_cost_components",
      "property_details",
      "rate_changes",
      "schema_migrations",
    ]);
  });

  it("migrates existing financial records into activity without changing their values", async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    const priorMigrations = mkdtempSync(join(tmpdir(), "loan-dashboard-migrations-"));
    try {
      const source = fileURLToPath(new URL("./migrations/", import.meta.url));
      for (const name of readdirSync(source).filter((entry) => entry < "0005_")) {
        writeFileSync(join(priorMigrations, name), requireMigration(source, name));
      }
      await runMigrations(db, priorMigrations);
      db.prepare(`INSERT INTO loans (
        id, name, lender, loan_type, sanctioned_amount_paise, annual_rate_percent,
        rate_type, tenure_months, start_date, emi_due_day
      ) VALUES ('legacy-loan', 'Legacy loan', 'Bank', 'home', 10000000, 8,
        'fixed', 120, '2026-01-01', 5)`).run();
      db.prepare(`INSERT INTO payments (
        id, loan_id, date, amount_paise, type, principal_part_paise,
        interest_part_paise, status, scheduled_period, note
      ) VALUES ('p1', 'legacy-loan', '2026-02-05', 12000, 'emi', 9000, 3000,
        'paid', 1, 'February payment')`).run();
      db.prepare(`INSERT INTO payments (
        id, loan_id, date, amount_paise, type, principal_part_paise,
        interest_part_paise, status, scheduled_period, note
      ) VALUES ('p2', 'legacy-loan', '2026-02-05', 12000, 'emi', 9000, 3000,
        'scheduled', 2, 'Duplicate due date')`).run();
      db.prepare(`INSERT INTO disbursements (id, loan_id, date, amount_paise, note)
        VALUES ('d1', 'legacy-loan', '2026-01-03', 50000, 'First tranche')`).run();
      db.prepare(`INSERT INTO contributions (id, loan_id, date, amount_paise, note)
        VALUES ('c1', 'legacy-loan', '2026-01-02', 10000, 'Booking')`).run();
      db.prepare(`INSERT INTO rate_changes (
        id, loan_id, effective_date, annual_rate_percent, mode
      ) VALUES ('r1', 'legacy-loan', '2026-03-01', 8.5, 'keep-emi')`).run();

      await runMigrations(db);

      const entries = db.prepare(`SELECT id, type, date, amount_paise AS amount, title,
        notes, status, interest_part_paise AS interestPart,
        principal_part_paise AS principalPart, new_rate_percent AS newRate
        FROM activity_entries WHERE loan_id = 'legacy-loan' ORDER BY id`).all();
      expect(entries).toEqual([
        expect.objectContaining({
          id: "legacy-contribution:c1", type: "SELF_CONTRIBUTION", amount: 10000,
          title: "Self contribution", notes: "Booking",
        }),
        expect.objectContaining({
          id: "legacy-disbursement:d1", type: "LOAN_DISBURSEMENT", amount: 50000,
          title: "Loan disbursement", notes: "First tranche",
        }),
        expect.objectContaining({
          id: "legacy-payment:p1", type: "EMI", amount: 12000, status: "PAID",
          interestPart: 3000, principalPart: 9000, notes: "February payment",
        }),
        expect.objectContaining({
          id: "legacy-payment:p2", type: "EMI", amount: 12000, status: "SKIPPED",
          interestPart: 3000, principalPart: 9000, notes: "Duplicate due date",
        }),
        expect.objectContaining({
          id: "legacy-rate-change:r1", type: "RATE_CHANGE", amount: null,
          newRate: 8.5, date: "2026-03-01",
        }),
      ]);
      expect(db.prepare("SELECT origin, user_edited AS userEdited FROM activity_entries WHERE id = 'legacy-payment:p1'").get())
        .toEqual({ origin: "USER", userEdited: 1 });
      expect(db.prepare("SELECT origin, user_edited AS userEdited FROM activity_entries WHERE id = 'legacy-payment:p2'").get())
        .toEqual({ origin: "AUTO", userEdited: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM payments").get()).toEqual({ count: 2 });
    } finally {
      rmSync(priorMigrations, { recursive: true, force: true });
    }
  });

  it("migrates legacy property cost groups and keeps activity component links intact", async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    const priorMigrations = mkdtempSync(join(tmpdir(), "loan-dashboard-property-migrations-"));
    try {
      const source = fileURLToPath(new URL("./migrations/", import.meta.url));
      for (const name of readdirSync(source).filter((entry) => entry < "0008_")) {
        writeFileSync(join(priorMigrations, name), requireMigration(source, name));
      }
      await runMigrations(db, priorMigrations);
      db.prepare(`INSERT INTO loans (
        id, name, lender, loan_type, sanctioned_amount_paise, annual_rate_percent,
        rate_type, tenure_months, start_date, emi_due_day
      ) VALUES ('legacy-property-loan', 'Legacy property', 'Bank', 'home', 10000000, 8,
        'fixed', 120, '2026-01-01', 5)`).run();
      const timestamp = "2026-01-01T00:00:00.000Z";
      db.prepare(`INSERT INTO property_cost_components
        (id, loan_id, name, cost_group, kind, amount_paise, created_at, updated_at)
        VALUES ('legacy-additional', 'legacy-property-loan', 'Corpus fund', 'OUTSIDE_AGREEMENT', 'CORPUS_FUND', 5000, ?, ?),
               ('legacy-cash', 'legacy-property-loan', 'Cash', 'OUTSIDE_AGREEMENT', 'IN_HAND_CASH', 6000, ?, ?)`).run(timestamp, timestamp, timestamp, timestamp);
      db.prepare(`INSERT INTO activity_entries
        (id, loan_id, type, date, amount_paise, title, origin, component_id, created_at, updated_at)
        VALUES ('legacy-linked-entry', 'legacy-property-loan', 'SELF_CONTRIBUTION', '2026-01-01', 5000, 'Paid corpus', 'USER', 'legacy-additional', ?, ?)`).run(timestamp, timestamp);
      await runMigrations(db);
      expect(db.prepare('SELECT id, cost_group AS "group", kind FROM property_cost_components ORDER BY id').all()).toEqual([
        { id: "legacy-additional", group: "ADDITIONAL", kind: "CORPUS_FUND" },
        { id: "legacy-cash", group: "CASH", kind: "CASH_PAYMENT" },
      ]);
      expect(db.prepare("SELECT component_id AS componentId FROM activity_entries WHERE id = 'legacy-linked-entry'").get()).toEqual({ componentId: "legacy-additional" });
      expect(db.prepare("SELECT loan_id AS loanId, noted_grand_total_paise AS notedGrandTotal FROM property_details").get()).toEqual({ loanId: "legacy-property-loan", notedGrandTotal: null });
    } finally {
      rmSync(priorMigrations, { recursive: true, force: true });
    }
  });

  it("enforces loan type, positive tenure, and foreign-key constraints", async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    await runMigrations(db);
    seedDemoData(db);
    expect(() =>
      db!.prepare("UPDATE loans SET tenure_months = 0 WHERE id = ?").run("demo-home-loan"),
    ).toThrow();
    expect(() =>
      db!
        .prepare("INSERT INTO disbursements (id, loan_id, date, amount_paise) VALUES (?, ?, ?, ?)")
        .run("invalid-child", "missing-loan", "2025-01-01", 100),
    ).toThrow();
  });

  it("aborts unapplied migrations when the verified pre-migration snapshot cannot be made", async () => {
    const root = mkdtempSync(join(tmpdir(), "loan-dashboard-migration-snapshot-fail-"));
    const databasePath = join(root, "loans.db");
    const migrations = join(root, "migrations");
    const backupBlocker = join(root, "not-a-directory");
    mkdirSync(migrations);
    writeFileSync(backupBlocker, "block snapshots");
    writeFileSync(join(migrations, "0001_test.sql"), "CREATE TABLE should_not_migrate (id INTEGER);");
    db = new Database(databasePath);
    try {
      await expect(runMigrations(db, migrations, backupBlocker)).rejects.toThrow(/Pre-migration snapshot failed/);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_not_migrate'").get()).toBeUndefined();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()).toBeUndefined();
    } finally {
      db.close();
      db = undefined;
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function requireMigration(directory: string, name: string): string {
  return readFileSync(join(directory, name), "utf8");
}
