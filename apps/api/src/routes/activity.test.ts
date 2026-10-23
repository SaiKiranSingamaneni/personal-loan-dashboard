import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openSqliteDatabase, type SqliteConnection } from "../db/connection.js";
import { createSqliteRepositories } from "../db/repositories.js";

describe("Activity and property APIs", () => {
  let connection: SqliteConnection;
  let app: ReturnType<typeof createApp>;
  let loanId: string;

  beforeEach(async () => {
    connection = openSqliteDatabase(":memory:");
    app = createApp(createSqliteRepositories(connection.client), undefined, connection.client);
    const created = await request(app).post("/api/loans").send({
      name: "Home loan", lender: "Example", loanType: "home", sanctionedAmount: 9_000_000,
      annualRatePercent: 8, rateType: "fixed", tenureMonths: 120,
      startDate: "2025-01-01", emiDueDay: 5, emiStartDate: "2025-02-05",
    });
    loanId = created.body.id as string;
  });

  afterEach(() => connection.close());

  it("creates, filters, paginates, edits, deletes, and restores Activity entries", async () => {
    const contribution = await request(app).post(`/api/loans/${loanId}/activity`).send({
      type: "SELF_CONTRIBUTION", date: "2025-01-02", title: "Bank booking", amount: 100_000,
      source: "BANK", notes: "Booking amount",
    }).expect(201);
    const contributionId = contribution.body.id as string;
    await request(app).post(`/api/loans/${loanId}/activity`).send({
      type: "LOAN_DISBURSEMENT", date: "2025-01-03", title: "First draw", amount: 200_000,
      trancheLabel: "Tranche 1",
    }).expect(201);
    const page = await request(app).get(`/api/loans/${loanId}/activity?type=SELF_CONTRIBUTION&page=1&pageSize=10`).expect(200);
    expect(page.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(page.body.totals.selfContributions).toBe(100_000);
    expect(page.body.items[0].title).toBe("Bank booking");

    const edited = await request(app).put(`/api/activity/${contributionId}`).send({ title: "Updated booking" }).expect(200);
    expect(edited.body.title).toBe("Updated booking");
    await request(app).delete(`/api/activity/${contributionId}`).expect(204);
    expect((await request(app).get(`/api/loans/${loanId}/activity?type=SELF_CONTRIBUTION`)).body.total).toBe(0);
    await request(app).post(`/api/activity/${contributionId}/restore`).expect(204);
    expect((await request(app).get(`/api/loans/${loanId}/activity?type=SELF_CONTRIBUTION`)).body.total).toBe(1);
  });

  it("validates Activity input and returns paise dashboard totals and property items", async () => {
    await request(app).post(`/api/loans/${loanId}/activity`).send({
      type: "EXTRA_EMI", date: "2025-02-05", title: "Bad payment", amount: 0,
    }).expect(400);
    const property = await request(app).put(`/api/loans/${loanId}/property`).send({
      components: [
        { name: "Base price", group: "AGREEMENT", kind: "BASE_PRICE", amount: 1_000_000 },
        { name: "Interiors", group: "OUTSIDE_AGREEMENT", kind: "INTERIORS", amount: 100_000 },
      ],
      invoiceGrandTotal: 900_000,
    }).expect(200);
    expect(property.body.components).toHaveLength(2);
    expect(property.body.invoiceGrandTotal).toBe(900_000);
    expect(property.body.invoiceMismatch).toBe(100_000);

    await request(app).post(`/api/loans/${loanId}/activity`).send({
      type: "LOAN_DISBURSEMENT", date: "2025-01-03", title: "First draw", amount: 250_000,
    }).expect(201);
    const dashboard = await request(app).get(`/api/loans/${loanId}/dashboard`).expect(200);
    expect(dashboard.body.summary).toMatchObject({
      sanctioned: 9_000_000, disbursed: 250_000, undisbursed: 8_750_000,
      agreementValue: 1_000_000, extraCosts: 100_000, totalOutlay: 1_100_000,
    });
    const exported = await request(app).get("/api/export").expect(200);
    expect(exported.body.activityEntries.length).toBeGreaterThan(0);
    expect(exported.body.propertyCostComponents).toHaveLength(2);
    expect(exported.body.loans[0].invoiceGrandTotal).toBe(900_000);
    const generated = await request(app)
      .get(`/api/loans/${loanId}/activity?type=EMI&status=PAID&pageSize=50`)
      .expect(200);
    expect(generated.body.total).toBeGreaterThan(0);
    expect(generated.body.items.every((item: { origin: string; status: string }) =>
      item.origin === "AUTO" && item.status === "PAID",
    )).toBe(true);
    const upcoming = await request(app)
      .get(`/api/loans/${loanId}/activity?status=UPCOMING&type=EMI`)
      .expect(200);
    expect(upcoming.body.total).toBe(1);
    expect(upcoming.body.items[0].status).toBe("UPCOMING");
    expect(upcoming.body.items[0].origin).toBe("AUTO");
  });

  it("combines server-side type, status, search, date, order, and pagination filters", async () => {
    const entries = [
      { type: "SELF_CONTRIBUTION", date: "2026-01-01", title: "Booking bank", amount: 10_000, source: "BANK" },
      { type: "LOAN_DISBURSEMENT", date: "2026-02-01", title: "Tranche alpha", amount: 20_000 },
      { type: "EMI", date: "2026-03-01", title: "March installment", amount: 5_000, dueDate: "2026-03-01", status: "PAID" },
      { type: "EXTRA_EMI", date: "2026-04-01", title: "Bonus payment", amount: 3_000, mode: "REDUCE_TENURE" },
    ];
    for (const entry of entries) await request(app).post(`/api/loans/${loanId}/activity`).send(entry).expect(201);

    const response = await request(app).get(
      `/api/loans/${loanId}/activity?type=EMI,EXTRA_EMI&status=PAID&from=2026-03-01&to=2026-04-01&q=installment&sort=oldest&page=1&pageSize=10`,
    ).expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(response.body.items[0].title).toBe("March installment");
    expect(response.body.totals.emisPaid).toBe(5_000);

    const newest = await request(app).get(`/api/loans/${loanId}/activity?from=2026-01-01&to=2026-04-01&sort=newest&page=1&pageSize=10`).expect(200);
    expect(newest.body.items[0].title).toBe("Bonus payment");
    const nextPage = await request(app).get(`/api/loans/${loanId}/activity?page=2&pageSize=10`).expect(200);
    expect(nextPage.body.page).toBe(2);
  });
});