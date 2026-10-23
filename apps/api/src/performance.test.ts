import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { addMonths, asIsoDate } from "@loan-dashboard/shared";
import { createApp } from "./app.js";
import { openSqliteDatabase, type SqliteConnection } from "./db/connection.js";
import { createSqliteRepositories } from "./db/repositories.js";

describe("large dashboard dataset performance", () => {
  let connection: SqliteConnection | undefined;

  afterEach(() => connection?.close());

  it("serves dashboard bootstrap data for five loans with 600 payments each under one second", async () => {
    connection = openSqliteDatabase(":memory:");
    const repositories = createSqliteRepositories(connection.client);
    const timestamp = new Date().toISOString();
    const firstPaymentDate = asIsoDate("1975-12-05");
    const insertPayment = connection.client.prepare(`
      INSERT INTO payments (
        id, loan_id, date, amount_paise, type, principal_part_paise,
        interest_part_paise, status, scheduled_period, prepayment_mode,
        note, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'emi', ?, ?, 'paid', ?, NULL, NULL, NULL, ?, ?)
    `);

    const loanIds = Array.from({ length: 5 }, (_value, loanIndex) => {
      const loan = repositories.loans.create({
        id: `performance-loan-${loanIndex + 1}`,
        name: `Performance loan ${loanIndex + 1}`,
        lender: "Example Bank",
        loanType: "home",
        accountReference: null,
        status: "active",
        sanctionedAmount: 10_000_000,
        annualRatePercent: 8.5,
        rateType: "fixed",
        tenureMonths: 600,
        startDate: "1975-11-01",
        emiDueDay: 5,
        emiOverride: null,
        processingFee: null,
        otherCharges: null,
        propertyCost: null,
        emiStartRule: "full-disbursement",
        emiStartDate: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const insertPayments = connection!.client.transaction(() => {
        for (let period = 1; period <= 600; period += 1) {
          insertPayment.run(
            randomUUID(),
            loan.id,
            addMonths(firstPaymentDate, period - 1),
            100_000,
            10_000,
            90_000,
            period,
            timestamp,
            timestamp,
          );
        }
      });
      insertPayments();
      return loan.id;
    });

    const app = createApp(repositories);
    const startedAt = performance.now();
    const responses = await Promise.all([
      request(app).get("/api/loans").expect(200),
      ...loanIds.flatMap((id) => [
        request(app).get(`/api/loans/${id}/summary`).expect(200),
        request(app).get(`/api/loans/${id}/schedule`).expect(200),
      ]),
    ]);
    const elapsedMs = performance.now() - startedAt;

    expect(responses[0]!.body).toHaveLength(5);
    for (let index = 0; index < loanIds.length; index += 1) {
      expect(responses[index * 2 + 2]!.body).toHaveLength(600);
    }
    expect(elapsedMs).toBeLessThan(1000);
  }, 15_000);
});
