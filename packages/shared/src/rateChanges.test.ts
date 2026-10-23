import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";
import { applyRateChanges } from "./rateChanges.js";

const schedule = createAmortizationSchedule({
  principal: asPaise(5_000_000),
  annualRatePercent: 10,
  tenureMonths: 120,
  firstDueDate: asIsoDate("2025-01-15"),
});

describe("floating rate changes", () => {
  it("keeps EMI and changes the term", () => {
    const recalculated = applyRateChanges(schedule, 10, [
      {
        effectiveDate: asIsoDate("2025-01-15"),
        annualRatePercent: 12,
        mode: "keep-emi",
      },
    ]);
    expect(recalculated[0]?.emi).toBe(schedule[0]?.emi);
    expect(recalculated.length).toBeGreaterThan(schedule.length);
    expect(recalculated.at(-1)?.closingBalance).toBe(0);
  });

  it("keeps the remaining term and changes EMI", () => {
    const recalculated = applyRateChanges(schedule, 10, [
      {
        effectiveDate: asIsoDate("2025-01-15"),
        annualRatePercent: 12,
        mode: "keep-tenure",
      },
    ]);
    expect(recalculated.length).toBe(schedule.length);
    expect(recalculated[0]?.emi).toBeGreaterThan(schedule[0]!.emi);
    expect(recalculated.at(-1)?.closingBalance).toBe(0);
  });

  it("sorts multiple resets and rejects changes after closure", () => {
    const recalculated = applyRateChanges(schedule, 10, [
      {
        effectiveDate: asIsoDate("2025-03-15"),
        annualRatePercent: 9,
        mode: "keep-tenure",
      },
      {
        effectiveDate: asIsoDate("2025-01-15"),
        annualRatePercent: 11,
        mode: "keep-tenure",
      },
    ]);
    expect(recalculated.at(-1)?.closingBalance).toBe(0);
    expect(() =>
      applyRateChanges(schedule, 10, [
        {
          effectiveDate: asIsoDate("2040-01-01"),
          annualRatePercent: 12,
          mode: "keep-tenure",
        },
      ]),
    ).toThrow();
  });
});
