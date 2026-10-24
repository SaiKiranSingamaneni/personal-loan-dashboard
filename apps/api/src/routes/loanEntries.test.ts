import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openSqliteDatabase, type SqliteConnection } from "../db/connection.js";
import { createSqliteRepositories } from "../db/repositories.js";

describe("payment and loan entry endpoints", () => {
  let connection: SqliteConnection;
  let app: ReturnType<typeof createApp>;
  let loanId: string;

  beforeEach(async () => {
    connection = openSqliteDatabase(":memory:");
    app = createApp(createSqliteRepositories(connection.client));
    const response = await request(app).post("/api/loans").send({
      name: "Test loan",
      lender: "Example Bank",
      loanType: "home",
      sanctionedAmount: 10_000_000,
      annualRatePercent: 8.5,
      rateType: "fixed",
      tenureMonths: 120,
      startDate: "2026-01-01",
      emiDueDay: 5,
    });
    loanId = response.body.id as string;
  });

  afterEach(() => connection.close());

  it("creates, lists, edits, and soft deletes each loan entry type", async () => {
    const disbursement = await request(app)
      .post(`/api/loans/${loanId}/disbursements`)
      .send({ date: "2026-01-01", amount: 6_000_000, note: "First stage" });
    expect(disbursement.status).toBe(201);
    const disbursementId = disbursement.body.id as string;
    expect((await request(app).get(`/api/loans/${loanId}/disbursements`)).body).toHaveLength(1);
    expect(
      (await request(app).put(`/api/disbursements/${disbursementId}`).send({ note: "Updated" }))
        .body.note,
    ).toBe("Updated");
    expect((await request(app).put(`/api/disbursements/${disbursementId}`).set("If-Match", '"1"').send({ note: "Stale edit" })).status).toBe(409);

    const contribution = await request(app)
      .post(`/api/loans/${loanId}/contributions`)
      .send({ date: "2026-01-02", amount: 2_000_000, note: "Down payment" });
    const contributionId = contribution.body.id as string;
    expect((await request(app).get(`/api/loans/${loanId}/contributions`)).body).toHaveLength(1);
    expect(
      (await request(app).put(`/api/contributions/${contributionId}`).send({ amount: 2_100_000 }))
        .body.amount,
    ).toBe(2_100_000);

    const rateChange = await request(app)
      .post(`/api/loans/${loanId}/rate-changes`)
      .send({ effectiveDate: "2026-02-01", annualRatePercent: 9, mode: "keep-tenure" });
    const rateChangeId = rateChange.body.id as string;
    expect((await request(app).get(`/api/loans/${loanId}/rate-changes`)).body).toHaveLength(1);
    expect(
      (await request(app)
        .put(`/api/rate-changes/${rateChangeId}`)
        .send({ annualRatePercent: 8.75 })).body.annualRatePercent,
    ).toBe(8.75);

    const payment = await request(app)
      .post(`/api/loans/${loanId}/payments`)
      .send({
        date: "2026-02-05",
        amount: 50_000,
        type: "emi",
        principalPart: 40_000,
        interestPart: 10_000,
        status: "paid",
        scheduledPeriod: 1,
      });
    const paymentId = payment.body.id as string;
    expect((await request(app).get(`/api/loans/${loanId}/payments`)).body).toHaveLength(1);
    expect(
      (await request(app).put(`/api/payments/${paymentId}`).send({ note: "Paid on time" })).body
        .note,
    ).toBe("Paid on time");
    expect((await request(app).put(`/api/payments/${paymentId}`).send({ amount: 1000 })).status).toBe(
      400,
    );

    const note = await request(app)
      .post(`/api/loans/${loanId}/notes`)
      .send({ date: "2026-02-06", text: "Confirmed payment", paymentId });
    const noteId = note.body.id as string;
    expect((await request(app).get(`/api/loans/${loanId}/notes`)).body).toHaveLength(1);
    expect(
      (await request(app).put(`/api/notes/${noteId}`).send({ text: "Called lender" })).body.text,
    ).toBe("Called lender");

    for (const [path, id] of [
      ["disbursements", disbursementId],
      ["contributions", contributionId],
      ["rate-changes", rateChangeId],
      ["payments", paymentId],
      ["notes", noteId],
    ]) {
      expect((await request(app).delete(`/api/${path}/${id}`)).status).toBe(204);
    }
    expect((await request(app).get(`/api/loans/${loanId}/notes`)).body).toHaveLength(0);
  });

  it("validates amounts and prevents notes from linking a payment from another loan", async () => {
    const invalid = await request(app)
      .post(`/api/loans/${loanId}/disbursements`)
      .send({ date: "2026-01-01", amount: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      (await request(app)
        .post(`/api/loans/${loanId}/contributions`)
        .send({ date: "2026-01-01", amount: 0 })).status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/loans/${loanId}/rate-changes`).send({
        effectiveDate: "2026-01-01",
        annualRatePercent: -2,
        mode: "invalid",
      })).status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/loans/${loanId}/notes`).send({
        date: "2026-01-01",
        text: "  ",
      })).status,
    ).toBe(400);
    const incompletePrepayment = await request(app)
      .post(`/api/loans/${loanId}/payments`)
      .send({
        date: "2026-01-01",
        amount: 10_000,
        type: "prepayment",
        principalPart: 10_000,
        interestPart: 0,
        status: "paid",
      });
    expect(incompletePrepayment.status).toBe(400);

    const secondLoan = await request(app).post("/api/loans").send({
      name: "Second loan",
      lender: "Example Bank",
      loanType: "personal",
      sanctionedAmount: 1_000_000,
      annualRatePercent: 10,
      rateType: "fixed",
      tenureMonths: 12,
      startDate: "2026-01-01",
      emiDueDay: 5,
    });
    const otherPayment = await request(app)
      .post(`/api/loans/${secondLoan.body.id}/payments`)
      .send({
        date: "2026-02-05",
        amount: 1000,
        type: "other",
        principalPart: 0,
        interestPart: 0,
        status: "paid",
      });
    const note = await request(app)
      .post(`/api/loans/${loanId}/notes`)
      .send({ date: "2026-02-06", text: "Wrong loan", paymentId: otherPayment.body.id });
    expect(note.status).toBe(400);
    expect(note.body.error.code).toBe("INVALID_PAYMENT_LINK");
  });
});
