import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";
import { applyPrepayment, emiForReducedBalance } from "./prepayments.js";

const baseSchedule = createAmortizationSchedule({
  principal: asPaise(5_000_000),
  annualRatePercent: 10,
  tenureMonths: 120,
  firstDueDate: asIsoDate("2025-01-15"),
});

describe("prepayments", () => {
  it("keeps EMI and shortens the term when reducing tenure", () => {
    const result = applyPrepayment(
      baseSchedule,
      asPaise(1_000_000),
      asIsoDate("2025-12-15"),
      10,
      "reduce-tenure",
    );
    expect(result.schedule[11]?.closingBalance).toBe(baseSchedule[11]?.closingBalance);
    expect(result.schedule[12]?.emi).toBe(baseSchedule[12]?.emi);
    expect(result.schedule.length).toBeLessThan(baseSchedule.length);
    expect(result.periodsSaved).toBeGreaterThan(0);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.schedule.at(-1)?.closingBalance).toBe(0);
  });

  it("keeps the term and lowers EMI when reducing EMI", () => {
    const result = applyPrepayment(
      baseSchedule,
      asPaise(1_000_000),
      asIsoDate("2025-12-15"),
      10,
      "reduce-emi",
    );
    expect(result.schedule.length).toBe(baseSchedule.length);
    expect(result.schedule[12]?.emi).toBeLessThan(baseSchedule[12]!.emi);
    expect(result.periodsSaved).toBe(0);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.schedule.at(-1)?.closingBalance).toBe(0);
  });

  it("calculates an EMI for a reduced balance and rejects invalid prepayments", () => {
    expect(emiForReducedBalance(asPaise(1_000_000), 10, 60)).toBeLessThan(
      emiForReducedBalance(asPaise(2_000_000), 10, 60),
    );
    expect(() =>
      applyPrepayment(
        baseSchedule,
        asPaise(5_000_000),
        asIsoDate("2025-12-15"),
        10,
        "reduce-tenure",
      ),
    ).toThrow();
  });
});
