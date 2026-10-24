import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteDatabase } from "./connection.js";
import { resolveDatabasePaths, rowCounts } from "./paths.js";
import { relocateDatabase } from "./relocate.js";

describe("database relocation", () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it("verifies a SQLite-API backup, compares table counts, and leaves the legacy DB untouched", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "loan-dashboard-relocate-"));
    const sourceDirectory = join(tempRoot, "apps", "api", "src", "db");
    const legacyDirectory = join(tempRoot, "apps", "api", "data");
    mkdirSync(sourceDirectory, { recursive: true });
    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(join(tempRoot, ".loan-dashboard-root"), "root\n");
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture" }));
    const legacyPath = join(legacyDirectory, "loans.db");
    const source = await openSqliteDatabase(legacyPath);
    source.client.prepare(`INSERT INTO loans (
      id, name, lender, loan_type, status, sanctioned_amount_paise,
      annual_rate_percent, rate_type, tenure_months, start_date, emi_due_day,
      emi_start_rule, created_at, updated_at
    ) VALUES ('legacy-1', 'Legacy', 'Bank', 'home', 'active', 1000000,
      8, 'fixed', 120, '2026-01-01', 5, 'full-disbursement', 'now', 'now')`).run();
    source.close();
    const originalCounts = rowCounts(legacyPath);
    const paths = resolveDatabasePaths(sourceDirectory, {});

    const result = await relocateDatabase(paths, {
      legacyCandidates: [legacyPath],
      assertApiStopped: async () => undefined,
    });

    expect(result).toMatchObject({ source: legacyPath, destination: paths.databasePath, counts: originalCounts });
    expect(rowCounts(paths.databasePath)).toEqual(originalCounts);
    expect(rowCounts(legacyPath)).toEqual(originalCounts);
    const verify = new Database(paths.databasePath, { readonly: true });
    try {
      expect(verify.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    } finally {
      verify.close();
    }
  });

  it("refuses relocation while the API-running guard reports active", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "loan-dashboard-relocate-active-"));
    mkdirSync(join(tempRoot, "apps", "api", "src", "db"), { recursive: true });
    writeFileSync(join(tempRoot, ".loan-dashboard-root"), "root\n");
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "fixture" }));
    const paths = resolveDatabasePaths(join(tempRoot, "apps", "api", "src", "db"), {});
    await expect(relocateDatabase(paths, {
      legacyCandidates: [],
      assertApiStopped: async () => { throw new Error("API is running"); },
    })).rejects.toThrow("API is running");
  });
});