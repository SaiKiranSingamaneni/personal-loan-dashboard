import { compareIsoDates, type IsoDate } from "./dates.js";
import type { AmortizationPeriod } from "./amortization.js";
import {
  createAmortizationSchedule,
  createScheduleWithFixedEmi,
} from "./amortization.js";

export type RateChangeMode = "keep-emi" | "keep-tenure";

export interface RateChange {
  effectiveDate: IsoDate;
  annualRatePercent: number;
  mode: RateChangeMode;
}

/** Apply ordered or unordered rate resets to a projected schedule. */
export function applyRateChanges(
  baseSchedule: readonly AmortizationPeriod[],
  initialAnnualRatePercent: number,
  changes: readonly RateChange[],
): AmortizationPeriod[] {
  if (baseSchedule.length === 0) {
    return [];
  }
  if (!Number.isFinite(initialAnnualRatePercent) || initialAnnualRatePercent < 0) {
    throw new Error("Initial annual interest rate must be non-negative");
  }
  const orderedChanges = [...changes].sort((left, right) =>
    compareIsoDates(left.effectiveDate, right.effectiveDate),
  );
  for (let index = 0; index < orderedChanges.length; index += 1) {
    const change = orderedChanges[index]!;
    if (!Number.isFinite(change.annualRatePercent) || change.annualRatePercent < 0) {
      throw new Error("Changed annual interest rate must be non-negative");
    }
    if (
      index > 0 &&
      orderedChanges[index - 1]!.effectiveDate === change.effectiveDate
    ) {
      throw new Error("Only one rate change may take effect on a date");
    }
  }

  let schedule = [...baseSchedule];
  for (const change of orderedChanges) {
    const firstAffectedIndex = schedule.findIndex(
      (row) => compareIsoDates(row.dueDate, change.effectiveDate) >= 0,
    );
    if (firstAffectedIndex < 0) {
      throw new Error("Rate change is after the projected loan closure date");
    }
    const prefix = schedule.slice(0, firstAffectedIndex);
    const remaining = schedule.slice(firstAffectedIndex);
    const balance = remaining[0]!.openingBalance;
    const firstDueDate = remaining[0]!.dueDate;
    const recalculated =
      change.mode === "keep-emi"
        ? createScheduleWithFixedEmi(
            balance,
            change.annualRatePercent,
            remaining[0]!.emi,
            1200,
            firstDueDate,
          )
        : createAmortizationSchedule({
            principal: balance,
            annualRatePercent: change.annualRatePercent,
            tenureMonths: remaining.length,
            firstDueDate,
          });
    schedule = [
      ...prefix,
      ...recalculated.map((row, index) => ({
        ...row,
        period: firstAffectedIndex + index + 1,
      })),
    ];
  }
  return schedule;
}
