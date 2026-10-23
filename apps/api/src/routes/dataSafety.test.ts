import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { BackupService } from "../db/backup.js";
import { openSqliteDatabase, type SqliteConnection } from "../db/connection.js";
import { createSqliteRepositories } from "../db/repositories.js";

describe("data safety endpoints", () => {
  let connection: SqliteConnection;
  let tempDirectory: string;
  let app: ReturnType<typeof createApp>;

  afterEach(() => {
    connection.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  });

  it("exports, previews, and transactionally overwrites all loan data", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "loan-dashboard-transfer-"));
    connection = openSqliteDatabase(":memory:");
    const repositories = createSqliteRepositories(connection.client);
    app = createApp(repositories, undefined, connection.client);
    const loan = await request(app).post("/api/loans").send({
      name: "Export loan",
      lender: "Example Bank",
      loanType: "home",
      sanctionedAmount: 1_000_000,
      annualRatePercent: 8,
      rateType: "fixed",
      tenureMonths: 12,
      startDate: "2026-01-01",
      emiDueDay: 5,
    });
    const loanId = loan.body.id as string;
    await request(app)
      .post(`/api/loans/${loanId}/contributions`)
      .send({ date: "2026-01-02", amount: 200_000, note: "Deposit" });

    const exported = await request(app).get("/api/export");
    expect(exported.status).toBe(200);
    expect(exported.body.loans).toHaveLength(1);
    expect(exported.body.contributions).toHaveLength(1);

    const extra = await request(app).post("/api/loans").send({
      name: "Extra loan",
      lender: "Example Bank",
      loanType: "personal",
      sanctionedAmount: 100_000,
      annualRatePercent: 12,
      rateType: "fixed",
      tenureMonths: 10,
      startDate: "2026-01-01",
      emiDueDay: 5,
    });
    const preview = await request(app)
      .post("/api/import")
      .send({ mode: "preview", data: exported.body });
    expect(preview.status).toBe(200);
    expect(preview.body.counts.loans).toBe(1);
    expect((await request(app).get("/api/loans")).body).toHaveLength(2);

    const overwritten = await request(app)
      .post("/api/import")
      .send({ mode: "overwrite", data: exported.body });
    expect(overwritten.status).toBe(200);
    expect((await request(app).get("/api/loans")).body).toHaveLength(1);
    const roundTrip = await request(app).get("/api/export");
    expect(roundTrip.body.loans).toEqual(exported.body.loans);
    expect(roundTrip.body.contributions).toEqual(exported.body.contributions);

    const invalid = await request(app)
      .post("/api/import")
      .send({ mode: "overwrite", data: { ...exported.body, formatVersion: 99 } });
    expect(invalid.status).toBe(400);
    expect((await request(app).get(`/api/loans/${extra.body.id}`)).status).toBe(404);
    expect(tempDirectory.length).toBeGreaterThan(0);
  });

  it("restores trashed entries and requires explicit confirmation to hard delete", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "loan-dashboard-trash-"));
    connection = openSqliteDatabase(":memory:");
    app = createApp(createSqliteRepositories(connection.client), undefined, connection.client);
    const loan = await request(app).post("/api/loans").send({
      name: "Trash loan",
      lender: "Example Bank",
      loanType: "personal",
      sanctionedAmount: 100_000,
      annualRatePercent: 10,
      rateType: "fixed",
      tenureMonths: 12,
      startDate: "2026-01-01",
      emiDueDay: 5,
    });
    const id = loan.body.id as string;
    await request(app).delete(`/api/loans/${id}`);
    expect((await request(app).get("/api/trash")).body).toHaveLength(1);

    const unconfirmed = await request(app).delete(`/api/trash/loan/${id}`).send({});
    expect(unconfirmed.status).toBe(400);
    const restored = await request(app).post(`/api/trash/loan/${id}/restore`);
    expect(restored.status).toBe(204);
    expect((await request(app).get(`/api/loans/${id}`)).status).toBe(200);

    await request(app).delete(`/api/loans/${id}`);
    const deleted = await request(app)
      .delete(`/api/trash/loan/${id}`)
      .send({ confirmation: "DELETE" });
    expect(deleted.status).toBe(204);
    expect((await request(app).get("/api/trash")).body).toHaveLength(0);
  });

  it("runs the what-if endpoint and creates a manual backup", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "loan-dashboard-backup-api-"));
    connection = openSqliteDatabase(join(tempDirectory, "loans.db"));
    const backupService = new BackupService(
      connection.client,
      connection.databasePath,
      join(tempDirectory, "backups"),
    );
    app = createApp(createSqliteRepositories(connection.client), backupService, connection.client);
    const simulation = await request(app).post("/api/simulate").send({
      principal: 10_000_000,
      annualRatePercent: 8.5,
      tenureMonths: 120,
      firstDueDate: "2026-11-05",
      scenario: {
        type: "prepayment",
        amount: 1_000_000,
        date: "2026-12-05",
        mode: "reduce-tenure",
      },
    });
    expect(simulation.status).toBe(200);
    expect(simulation.body.interestSaved).toBeGreaterThan(0);

    const backup = await request(app).post("/api/backup");
    expect(backup.status).toBe(201);
    expect(backup.body.path).toContain("loans-");
  });
});
