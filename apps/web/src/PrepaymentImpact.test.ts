import { describe, expect, it } from "vitest";
import { asIsoDate, asPaise, createAmortizationSchedule } from "@loan-dashboard/shared";
import { calculatePrepaymentImpact } from "./PrepaymentImpact.js";

describe("prepayment impact", () => {
  const schedule = createAmortizationSchedule({
    principal: asPaise(5_000_000),
    annualRatePercent: 8.5,
    tenureMonths: 60,
    firstDueDate: asIsoDate("2026-02-05"),
  });

  it("shows interest and term savings for paid reduce-tenure prepayments only", () => {
    const result = calculatePrepaymentImpact(schedule, [
      { date: "2026-08-05", type: "prepayment", status: "paid", amount: 500_000, principalPart: 500_000, prepaymentMode: "reduce-tenure" },
      { date: "2026-09-05", type: "prepayment", status: "scheduled", amount: 900_000, principalPart: 900_000, prepaymentMode: "reduce-tenure" },
    ], 8.5);
    expect(result.hasPrepayments).toBe(true);
    expect(result.withInterest).toBeLessThan(result.withoutInterest);
    expect(result.withMonths).toBeLessThan(result.withoutMonths);
  });

  it("reduces interest while preserving the remaining term in reduce-EMI mode", () => {
    const result = calculatePrepaymentImpact(schedule, [
      { date: "2026-08-05", type: "part-payment", status: "paid", amount: 500_000, principalPart: 500_000, prepaymentMode: "reduce-emi" },
    ], 8.5);
    expect(result.withInterest).toBeLessThan(result.withoutInterest);
    expect(result.withMonths).toBe(result.withoutMonths);
  });
});
