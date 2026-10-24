import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { openSqliteDatabase } from "./connection.js";

export function seedDemoData(db: Database.Database): boolean {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM loans").get() as {
    count: number;
  };
  if (existing.count > 0) {
    return false;
  }

  const timestamp = new Date().toISOString();
  const addLoan = db.prepare(`
    INSERT INTO loans (
      id, name, lender, loan_type, account_reference, status,
      sanctioned_amount_paise, annual_rate_percent, rate_type, tenure_months,
      start_date, emi_due_day, property_cost_paise, emi_start_rule,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, 'full-disbursement', ?, ?)
  `);
  const addDisbursement = db.prepare(`
    INSERT INTO disbursements (id, loan_id, date, amount_paise, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const addContribution = db.prepare(`
    INSERT INTO contributions (id, loan_id, date, amount_paise, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSeed = db.transaction(() => {
    addLoan.run(
      "demo-home-loan",
      "Home loan",
      "Example Bank",
      "home",
      "DEMO-HOME-001",
      50_000_000,
      8.5,
      "floating",
      240,
      "2024-01-15",
      5,
      62_500_000,
      timestamp,
      timestamp,
    );
    addLoan.run(
      "demo-plot-loan",
      "Plot loan",
      "Example Credit Union",
      "plot",
      "DEMO-PLOT-002",
      18_000_000,
      9.25,
      "fixed",
      120,
      "2025-03-10",
      10,
      25_000_000,
      timestamp,
      timestamp,
    );
    addDisbursement.run(
      "demo-home-disbursement-1",
      "demo-home-loan",
      "2024-01-15",
      50_000_000,
      "Initial disbursement",
      timestamp,
      timestamp,
    );
    addDisbursement.run(
      "demo-plot-disbursement-1",
      "demo-plot-loan",
      "2025-03-10",
      18_000_000,
      "Plot purchase disbursement",
      timestamp,
      timestamp,
    );
    addContribution.run(
      "demo-home-contribution-1",
      "demo-home-loan",
      "2024-01-10",
      12_500_000,
      "Down payment and registration",
      timestamp,
      timestamp,
    );
    addContribution.run(
      "demo-plot-contribution-1",
      "demo-plot-loan",
      "2025-03-05",
      7_000_000,
      "Own contribution",
      timestamp,
      timestamp,
    );
  });
  insertSeed();
  return true;
}

async function runSeedScript(): Promise<void> {
  const connection = await openSqliteDatabase();
  try {
    const inserted = seedDemoData(connection.client);
    process.stdout.write(inserted ? "Seeded two demo loans.\n" : "Database already contains loans; no seed data added.\n");
  } finally {
    connection.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runSeedScript();
}
