import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { asPaise } from "./money.js";
import { createStagedDisbursementSchedule } from "./disbursements.js";

describe("staged disbursement schedules", () => {
  it("charges pre-EMI interest only on the amount already disbursed", () => {
    const schedule = createStagedDisbursementSchedule({
      sanctionedAmount: asPaise(1_000_000),
      annualRatePercent: 12,
      tenureMonths: 12,
      firstDueDate: asIsoDate("2025-01-01"),
      disbursements: [
        { date: asIsoDate("2024-12-01"), amount: asPaise(400_000) },
        { date: asIsoDate("2025-02-10"), amount: asPaise(600_000) },
      ],
      emiStartRule: { type: "full-disbursement" },
    });
    expect(schedule[0]?.principal).toBe(0);
    expect(schedule[0]?.interest).toBe(asPaise(4_000));
    expect(schedule[0]?.closingBalance).toBe(asPaise(400_000));
    expect(schedule[1]?.dueDate).toBe("2025-02-01");
    expect(schedule[1]?.interest).toBe(asPaise(4_000));
    expect(schedule[2]?.dueDate).toBe("2025-03-01");
    expect(schedule[2]?.openingBalance).toBe(asPaise(1_000_000));
    expect(schedule.at(-1)?.closingBalance).toBe(0);
  });

  it("starts EMI on a configured date after pre-EMI periods", () => {
    const schedule = createStagedDisbursementSchedule({
      sanctionedAmount: asPaise(500_000),
      annualRatePercent: 8,
      tenureMonths: 6,
      firstDueDate: asIsoDate("2025-01-15"),
      disbursements: [
        { date: asIsoDate("2024-12-15"), amount: asPaise(500_000) },
      ],
      emiStartRule: { type: "date", date: asIsoDate("2025-03-01") },
    });
    expect(schedule.slice(0, 2).every((row) => row.principal === 0)).toBe(true);
    expect(schedule[2]?.dueDate).toBe("2025-03-15");
    expect(schedule[2]?.principal).toBeGreaterThan(0);
    expect(schedule.at(-1)?.closingBalance).toBe(0);
  });

  it("rejects disbursements above sanction and incomplete full-disbursement starts", () => {
    const input = {
      sanctionedAmount: asPaise(1000),
      annualRatePercent: 10,
      tenureMonths: 10,
      firstDueDate: asIsoDate("2025-01-01"),
      disbursements: [{ date: asIsoDate("2024-12-01"), amount: asPaise(1000) }],
      emiStartRule: { type: "full-disbursement" as const },
    };
    expect(() =>
      createStagedDisbursementSchedule({
        ...input,
        disbursements: [{ ...input.disbursements[0]!, amount: asPaise(1001) }],
      }),
    ).toThrow();
    expect(() =>
      createStagedDisbursementSchedule({
        ...input,
        sanctionedAmount: asPaise(2000),
      }),
    ).toThrow();
  });
});
