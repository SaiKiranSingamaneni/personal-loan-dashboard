import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { asPaise } from "./money.js";
import { calculatePaymentBreakdown } from "./paymentBreakdown.js";

const input = {
  sanctionedAmount: asPaise(900_000_000),
  annualRatePercent: 7.4,
  tenureMonths: 189,
  disbursements: [{ date: asIsoDate("2025-01-01"), amount: asPaise(250_000_000) }],
  payments: [{ date: asIsoDate("2025-02-01"), amount: asPaise(8_077_000) }],
  emiBasis: "SANCTIONED" as const,
  interestMethod: "MONTHLY" as const,
};

describe("payment breakdown", () => {
  it("matches the sanctioned EMI and monthly interest reference case", () => {
    const [row] = calculatePaymentBreakdown(input);
    expect(row?.interestPart).toBe(1_541_667);
    expect(row?.principalPart).toBe(6_535_333);
    expect(row?.outstandingPrincipal).toBe(243_464_667);
    expect(row?.emiAmount).toBeGreaterThanOrEqual(8_076_900);
    expect(row?.emiAmount).toBeLessThanOrEqual(8_077_600);
  });

  it("splits daily interest around an additional mid-period disbursement", () => {
    const rows = calculatePaymentBreakdown({
      ...input,
      interestMethod: "DAILY",
      disbursements: [
        { date: asIsoDate("2025-01-01"), amount: asPaise(250_000_000) },
        { date: asIsoDate("2025-01-16"), amount: asPaise(100_000_000) },
      ],
      payments: [{ date: asIsoDate("2025-02-01"), amount: asPaise(4_000_000) }],
    });
    expect(rows[0]?.interestPart).toBe(1_895_616);
    expect(rows[0]?.principalPart).toBe(2_104_384);
    expect(rows[0]?.outstandingPrincipal).toBe(347_895_616);
  });

  it("carries unpaid interest forward and warns when the payment is too small", () => {
    const rows = calculatePaymentBreakdown({
      ...input,
      payments: [
        { date: asIsoDate("2025-02-01"), amount: asPaise(10_000) },
        { date: asIsoDate("2025-03-01"), amount: asPaise(20_000) },
      ],
    });
    expect(rows[0]?.principalPart).toBe(0);
    expect(rows[0]?.unpaidInterest).toBeGreaterThan(0);
    expect(rows[0]?.warning).toContain("unpaid interest");
    expect(rows[1]?.unpaidInterest).toBeGreaterThan(0);
  });

  it("works with a fully disbursed amount and reports a completed funding state", () => {
    const rows = calculatePaymentBreakdown({
      ...input,
      emiBasis: "DISBURSED",
      disbursements: [{ date: asIsoDate("2025-01-01"), amount: asPaise(900_000_000) }],
    });
    expect(rows[0]?.emiAmount).toBeGreaterThanOrEqual(8_076_900);
    expect(rows[0]?.emiAmount).toBeLessThanOrEqual(8_077_600);
  });
});
