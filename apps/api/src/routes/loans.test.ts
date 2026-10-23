import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openSqliteDatabase, type SqliteConnection } from "../db/connection.js";
import { createSqliteRepositories } from "../db/repositories.js";

describe("loan REST endpoints", () => {
  let connection: SqliteConnection;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    connection = openSqliteDatabase(":memory:");
    app = createApp(createSqliteRepositories(connection.client));
  });

  afterEach(() => connection.close());

  const validLoan = {
    name: "Home loan",
    lender: "Example Bank",
    loanType: "home",
    sanctionedAmount: 10_000_000,
    annualRatePercent: 8.5,
    rateType: "floating",
    tenureMonths: 24,
    startDate: "2026-10-01",
    emiDueDay: 5,
    propertyCost: 15_000_000,
  };

  it("creates, reads, updates, lists, and soft deletes a loan", async () => {
    const created = await request(app).post("/api/loans").send(validLoan);
    expect(created.status).toBe(201);
    expect(created.body.name).toBe("Home loan");
    expect(created.body.id).toEqual(expect.any(String));
    const id = created.body.id as string;

    expect((await request(app).get("/api/loans")).body).toHaveLength(1);
    expect((await request(app).get(`/api/loans/${id}`)).body.lender).toBe("Example Bank");
    const updated = await request(app).put(`/api/loans/${id}`).send({ name: "Updated loan" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated loan");

    expect((await request(app).delete(`/api/loans/${id}`)).status).toBe(204);
    expect((await request(app).get("/api/loans")).body).toHaveLength(0);
    expect((await request(app).get(`/api/loans/${id}`)).status).toBe(404);
  });

  it("returns field validation failures and rejects a missing loan", async () => {
    const invalid = await request(app)
      .post("/api/loans")
      .send({ ...validLoan, name: "", startDate: "2026-02-30" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalid.body.error.fields.name).toBeDefined();
    expect(invalid.body.error.fields.startDate).toBeDefined();
    expect((await request(app).get("/api/loans/missing")).body.error.code).toBe(
      "LOAN_NOT_FOUND",
    );
  });

  it("archives a loan without deleting its data", async () => {
    const created = await request(app).post("/api/loans").send(validLoan);
    const id = created.body.id as string;
    const archived = await request(app).post(`/api/loans/${id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toEqual(expect.any(String));
    expect((await request(app).get(`/api/loans/${id}`)).status).toBe(200);
  });

  it("saves initial funding entries atomically on create and updates their totals", async () => {
    const created = await request(app).post("/api/loans").send({
      ...validLoan,
      initialOwnContribution: 2_000_000,
      initialLoanUtilized: 6_000_000,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await request(app).get(`/api/loans/${id}/contributions`)).body[0].amount).toBe(
      2_000_000,
    );
    expect((await request(app).get(`/api/loans/${id}/disbursements`)).body[0].amount).toBe(
      6_000_000,
    );
    const updated = await request(app).put(`/api/loans/${id}`).send({
      initialOwnContribution: 2_500_000,
      initialLoanUtilized: 6_500_000,
    });
    expect(updated.status).toBe(200);
    expect((await request(app).get(`/api/loans/${id}/contributions`)).body).toHaveLength(1);
    expect((await request(app).get(`/api/loans/${id}/contributions`)).body[0].amount).toBe(
      2_500_000,
    );
    expect((await request(app).get(`/api/loans/${id}/disbursements`)).body[0].amount).toBe(
      6_500_000,
    );
  });

  it("returns a full amortization schedule and derived summary", async () => {
    const created = await request(app).post("/api/loans").send(validLoan);
    const id = created.body.id as string;
    const repos = createSqliteRepositories(connection.client);
    const timestamp = new Date().toISOString();
    repos.children.disbursements.create({
      id: "disbursement-1",
      loanId: id,
      date: "2026-10-01",
      amount: 8_000_000,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const schedule = await request(app).get(`/api/loans/${id}/schedule`);
    expect(schedule.status).toBe(200);
    expect(schedule.body).toHaveLength(24);
    expect(schedule.body.at(-1).closingBalance).toBe(0);
    const summary = await request(app).get(`/api/loans/${id}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.summary.outstandingPrincipal).toBe(8_000_000);
    expect(summary.body.summary.emi).toBe(schedule.body[0].emi);
    expect(summary.body.summary.sanctionedNotDisbursed).toBe(2_000_000);
  });

  it("generates scheduled EMI entries idempotently and refreshes only still-scheduled rows", async () => {
    const created = await request(app).post("/api/loans").send(validLoan);
    const id = created.body.id as string;
    const path = `/api/loans/${id}/payments/generate-scheduled`;
    const first = await request(app).post(path).send();
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ created: 24, updated: 0, total: 24 });
    expect((await request(app).get(`/api/loans/${id}/payments`)).body).toHaveLength(24);

    const second = await request(app).post(path).send();
    expect(second.body).toEqual({ created: 0, updated: 24, total: 24 });
    const payments = (await request(app).get(`/api/loans/${id}/payments`)).body as {
      id: string;
      amount: number;
      status: string;
      scheduledPeriod: number;
    }[];
    const firstPayment = payments.find((payment) => payment.scheduledPeriod === 1)!;
    await request(app).put(`/api/payments/${firstPayment.id}`).send({ status: "paid", date: "2026-11-08", amount: 999_999_999 });
    const third = await request(app).post(path).send();
    expect(third.body).toEqual({ created: 0, updated: 23, total: 24 });
    const after = (await request(app).get(`/api/loans/${id}/payments`)).body as typeof payments;
    expect(after.find((payment) => payment.scheduledPeriod === 1)).toMatchObject({
      status: "paid",
      date: "2026-11-08",
      amount: 999_999_999,
    });
  });
});
