import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";
import { simulate } from "./simulate.js";

const schedule = createAmortizationSchedule({
  principal: asPaise(5_000_000),
  annualRatePercent: 10,
  tenureMonths: 120,
  firstDueDate: asIsoDate("2025-01-15"),
});

describe("what-if simulation", () => {
  it("projects one-time and recurring prepayments without mutating the base", () => {
    const result = simulate({
      schedule,
      annualRatePercent: 10,
      scenario: {
        type: "prepayment",
        amount: asPaise(500_000),
        date: asIsoDate("2025-12-15"),
        mode: "reduce-tenure",
      },
    });
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.schedule.at(-1)?.closingBalance).toBe(0);
    expect(schedule).toHaveLength(120);

    const recurring = simulate({
      schedule,
      annualRatePercent: 10,
      scenario: {
        type: "recurring-prepayment",
        amount: asPaise(100_000),
        firstDate: asIsoDate("2025-12-15"),
        intervalMonths: 12,
        count: 3,
        mode: "reduce-emi",
      },
    });
    expect(recurring.interestSaved).toBeGreaterThan(0);
    expect(recurring.projectedEmi).toBeLessThan(recurring.baseEmi);
  });

  it("supports stateless rate scenarios and validates recurrence settings", () => {
    const rateResult = simulate({
      schedule,
      annualRatePercent: 10,
      scenario: {
        type: "rate-change",
        changes: [
          {
            effectiveDate: asIsoDate("2025-01-15"),
            annualRatePercent: 9,
            mode: "keep-tenure",
          },
        ],
      },
    });
    expect(rateResult.projectedEmi).toBeLessThan(rateResult.baseEmi);
    expect(rateResult.interestSaved).toBeGreaterThan(0);
    expect(() =>
      simulate({
        schedule,
        annualRatePercent: 10,
        scenario: {
          type: "recurring-prepayment",
          amount: asPaise(100),
          firstDate: asIsoDate("2025-12-15"),
          intervalMonths: 0,
          count: 2,
          mode: "reduce-tenure",
        },
      }),
    ).toThrow();
  });
});
