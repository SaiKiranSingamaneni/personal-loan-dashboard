import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "./connection.js";
import { seedDemoData } from "./seed.js";

describe("initial SQLite schema and demo seed", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("creates all loan entities and seeds two related demo loans idempotently", () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
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
      "contributions",
      "disbursements",
      "loans",
      "notes",
      "payments",
      "rate_changes",
      "schema_migrations",
    ]);
  });

  it("enforces loan type, positive tenure, and foreign-key constraints", () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
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
});
