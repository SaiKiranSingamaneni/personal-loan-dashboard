import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";
import { summarizeLoan } from "./summary.js";

const schedule = createAmortizationSchedule({
  principal: asPaise(100_000),
  annualRatePercent: 12,
  tenureMonths: 3,
  firstDueDate: asIsoDate("2025-02-01"),
});

describe("loan summary", () => {
  it("derives funding, repayment, due, interest, and closure metrics", () => {
    const summary = summarizeLoan({
      sanctionedAmount: asPaise(120_000),
      propertyCost: asPaise(200_000),
      ownContribution: asPaise(50_000),
      disbursements: [
        { date: asIsoDate("2025-01-01"), amount: asPaise(100_000) },
      ],
      schedule,
      payments: [
        {
          date: asIsoDate("2025-02-01"),
          amount: schedule[0]!.emi,
          principalPart: schedule[0]!.principal,
          interestPart: schedule[0]!.interest,
          status: "paid",
          scheduledPeriod: 1,
        },
      ],
      asOf: asIsoDate("2025-02-01"),
    });
    expect(summary.ownContributionPercent).toBe(25);
    expect(summary.loanSharePercent).toBe(50);
    expect(summary.propertyCostRemaining).toBe(50_000);
    expect(summary.sanctionedNotDisbursed).toBe(20_000);
    expect(summary.principalRepaid).toBe(schedule[0]!.principal);
    expect(summary.interestPaidToDate).toBe(schedule[0]!.interest);
    expect(summary.outstandingPrincipal).toBe(100_000 - schedule[0]!.principal);
    expect(summary.emi).toBe(schedule[0]!.emi);
    expect(summary.nextDueDate).toBe("2025-03-01");
    expect(summary.emisPaid).toBe(1);
    expect(summary.emisRemaining).toBe(2);
    expect(summary.projectedClosureDate).toBe("2025-04-01");
    expect(summary.warnings).toEqual([]);
  });

  it("warns when funding exceeds property cost, sanction, or outstanding", () => {
    const summary = summarizeLoan({
      sanctionedAmount: asPaise(50_000),
      propertyCost: asPaise(100_000),
      ownContribution: asPaise(60_000),
      disbursements: [
        { date: asIsoDate("2025-01-01"), amount: asPaise(60_000) },
      ],
      schedule,
      payments: [
        {
          date: asIsoDate("2025-01-01"),
          amount: asPaise(70_000),
          principalPart: asPaise(70_000),
          interestPart: asPaise(0),
          status: "paid",
        },
      ],
      asOf: asIsoDate("2025-01-01"),
    });
    expect(summary.warnings).toHaveLength(3);
    expect(summary.propertyCostRemaining).toBe(-20_000);
    expect(summary.outstandingPrincipal).toBe(-10_000);
  });
});
