import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openSqliteDatabase, type SqliteConnection } from "../db/connection.js";
import { createSqliteRepositories } from "../db/repositories.js";

function shiftDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("loan timeline endpoint", () => {
  let connection: SqliteConnection;
  let app: ReturnType<typeof createApp>;
  let loanId: string;

  beforeEach(async () => {
    connection = await openSqliteDatabase(":memory:");
    app = createApp(createSqliteRepositories(connection.client));
    const loan = await request(app).post("/api/loans").send({
      name: "Timeline loan",
      lender: "Example Bank",
      loanType: "home",
      sanctionedAmount: 1_000_000,
      annualRatePercent: 8,
      rateType: "fixed",
      tenureMonths: 24,
      startDate: shiftDate(-40),
      emiDueDay: 5,
    });
    loanId = loan.body.id as string;
    await request(app).post(`/api/loans/${loanId}/payments`).send({
      date: shiftDate(-2),
      amount: 10_000,
      type: "emi",
      principalPart: 8_000,
      interestPart: 2_000,
      status: "scheduled",
    });
    await request(app)
      .post(`/api/loans/${loanId}/disbursements`)
      .send({ date: shiftDate(-5), amount: 500_000, note: "First release" });
    await request(app)
      .post(`/api/loans/${loanId}/contributions`)
      .send({ date: shiftDate(-4), amount: 100_000, note: "Down payment" });
    await request(app).post(`/api/loans/${loanId}/rate-changes`).send({
      effectiveDate: shiftDate(2),
      annualRatePercent: 8.5,
      mode: "keep-emi",
    });
    await request(app).post(`/api/loans/${loanId}/notes`).send({
      date: shiftDate(1),
      text: "Call bank about reset",
    });
  });

  afterEach(() => connection.close());

  it("merges entry types chronologically and marks upcoming and overdue items", async () => {
    const response = await request(app).get(`/api/loans/${loanId}/timeline`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(5);
    expect(response.body.map((item: { type: string }) => item.type)).toEqual([
      "rate-change",
      "note",
      "payment",
      "contribution",
      "disbursement",
    ]);
    expect(response.body[0].upcoming).toBe(true);
    expect(response.body[2].overdue).toBe(true);
  });

  it("filters by type, date range, and search, and supports ascending order", async () => {
    const response = await request(app).get(
      `/api/loans/${loanId}/timeline?type=note&from=${shiftDate(0)}&to=${shiftDate(3)}&q=CALL&order=asc`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].detail).toBe("Call bank about reset");
    expect(response.body[0].type).toBe("note");
  });

  it("validates query parameters and reports unknown loans", async () => {
    const invalid = await request(app).get(
      `/api/loans/${loanId}/timeline?from=${shiftDate(3)}&to=${shiftDate(0)}`,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect((await request(app).get("/api/loans/missing/timeline")).status).toBe(404);
  });
});
