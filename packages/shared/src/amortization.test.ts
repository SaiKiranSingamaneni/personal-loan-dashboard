import { describe, expect, it } from "vitest";
import { addMonths, asIsoDate } from "./dates.js";
import { calculateEmi, createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";

describe("amortization", () => {
  it("matches the ₹50 lakh, 8.5%, 20 year EMI known-answer case", () => {
    // Independently evaluated using the standard reducing-balance EMI equation.
    expect(calculateEmi(asPaise(500_000_000), 8.5, 240)).toBe(asPaise(4_339_116));
  });

  it("creates a schedule that closes exactly at zero", () => {
    const rows = createAmortizationSchedule({
      principal: asPaise(10_000_000),
      annualRatePercent: 12,
      tenureMonths: 12,
      firstDueDate: asIsoDate("2024-01-31"),
    });
    expect(rows).toHaveLength(12);
    expect(rows[0]?.dueDate).toBe("2024-01-31");
    expect(rows[1]?.dueDate).toBe("2024-02-29");
    expect(rows[2]?.dueDate).toBe(addMonths(asIsoDate("2024-01-31"), 2));
    expect(rows.at(-1)?.closingBalance).toBe(0);
    expect(rows.reduce((sum, row) => sum + row.principal, 0)).toBe(10_000_000);
    expect(rows.every((row) => row.interest >= 0)).toBe(true);
  });

  it("supports zero interest and adjusts the final installment", () => {
    const rows = createAmortizationSchedule({
      principal: asPaise(1000),
      annualRatePercent: 0,
      tenureMonths: 3,
      firstDueDate: asIsoDate("2025-01-15"),
    });
    expect(rows.map((row) => row.emi)).toEqual([333, 333, 334]);
    expect(rows.at(-1)?.closingBalance).toBe(0);
  });

  it("rejects invalid loan terms", () => {
    expect(() => calculateEmi(asPaise(100), 8, 0)).toThrow();
    expect(() => calculateEmi(asPaise(100), -1, 1)).toThrow();
  });
});
