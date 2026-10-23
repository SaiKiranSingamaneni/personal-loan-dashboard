import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";
import {
  outstandingBalanceAsOf,
  reconcileSchedule,
  type RecordedPayment,
} from "./payments.js";

const schedule = createAmortizationSchedule({
  principal: asPaise(10_000),
  annualRatePercent: 0,
  tenureMonths: 3,
  firstDueDate: asIsoDate("2025-01-31"),
});

const payments: RecordedPayment[] = [
  {
    date: asIsoDate("2025-01-31"),
    amount: asPaise(2500),
    principalPart: asPaise(2000),
    interestPart: asPaise(500),
    status: "paid",
    scheduledPeriod: 1,
  },
  {
    date: asIsoDate("2025-02-10"),
    amount: asPaise(1000),
    principalPart: asPaise(1000),
    interestPart: asPaise(0),
    status: "paid",
  },
  {
    date: asIsoDate("2025-02-28"),
    amount: asPaise(0),
    principalPart: asPaise(0),
    interestPart: asPaise(0),
    status: "missed",
    scheduledPeriod: 2,
  },
];

describe("payment reconciliation", () => {
  it("reports actual amounts and status alongside scheduled rows", () => {
    const rows = reconcileSchedule(schedule, payments);
    expect(rows[0]?.actualAmount).toBe(2500);
    expect(rows[0]?.actualPrincipal).toBe(2000);
    expect(rows[0]?.actualStatus).toBe("paid");
    expect(rows[1]?.actualStatus).toBe("missed");
    expect(rows[1]?.actualAmount).toBe(0);
  });

  it("reduces actual balance by principal paid by each due date", () => {
    const rows = reconcileSchedule(schedule, payments);
    expect(rows[0]?.actualOutstanding).toBe(8000);
    expect(rows[1]?.actualOutstanding).toBe(7000);
    expect(
      outstandingBalanceAsOf(asPaise(10_000), payments, asIsoDate("2025-02-09")),
    ).toBe(8000);
    expect(
      outstandingBalanceAsOf(asPaise(10_000), payments, asIsoDate("2025-02-10")),
    ).toBe(7000);
  });

  it("ignores scheduled payments and rejects principal overpayment", () => {
    const scheduled: RecordedPayment = {
      date: asIsoDate("2025-03-31"),
      amount: asPaise(4000),
      principalPart: asPaise(4000),
      interestPart: asPaise(0),
      status: "scheduled",
    };
    expect(
      outstandingBalanceAsOf(asPaise(10_000), [scheduled], asIsoDate("2025-12-31")),
    ).toBe(10_000);
    expect(() =>
      outstandingBalanceAsOf(
        asPaise(100),
        [{ ...scheduled, principalPart: asPaise(101), status: "paid" }],
        asIsoDate("2025-12-31"),
      ),
    ).toThrow();
  });
});
