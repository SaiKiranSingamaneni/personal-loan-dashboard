import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { createAmortizationSchedule } from "./amortization.js";
import { asPaise } from "./money.js";

describe("amortization invariants over varied loan terms", () => {
  it("closes every deterministic randomized schedule with exact principal and non-negative interest", () => {
    let seed = 834_721;
    const random = (): number => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    for (let sample = 0; sample < 100; sample += 1) {
      const principal = asPaise(10_000 + Math.floor(random() * 1_000_000_000));
      const annualRatePercent = Math.round(random() * 2400) / 100;
      const tenureMonths = 3 + Math.floor(random() * 358);
      const schedule = createAmortizationSchedule({
        principal,
        annualRatePercent,
        tenureMonths,
        firstDueDate: asIsoDate("2024-01-31"),
      });

      expect(schedule.at(-1)?.closingBalance).toBe(0);
      expect(schedule.reduce((sum, row) => sum + row.principal, 0)).toBe(principal);
      expect(schedule.every((row) => row.interest >= 0)).toBe(true);
    }
  });
});
