import { addMonths, compareIsoDates, type IsoDate } from "./dates.js";
import type { AmortizationPeriod } from "./amortization.js";
import { calculateEmi, createAmortizationSchedule } from "./amortization.js";
import { asPaise, roundToPaise, type Paise } from "./money.js";

export type PrepaymentMode = "reduce-tenure" | "reduce-emi";

export interface PrepaymentResult {
  schedule: AmortizationPeriod[];
  appliedAmount: Paise;
  interestSaved: Paise;
  periodsSaved: number;
}

function scheduleWithFixedEmi(
  principal: Paise,
  annualRatePercent: number,
  emi: Paise,
  maxMonths: number,
  firstDueDate: IsoDate,
): AmortizationPeriod[] {
  const monthlyRate = annualRatePercent / 1200;
  const rows: AmortizationPeriod[] = [];
  let openingBalance = principal;

  for (let index = 0; index < maxMonths && openingBalance > 0; index += 1) {
    const interest = roundToPaise(openingBalance * monthlyRate);
    if (emi <= interest) {
      throw new Error("EMI must exceed monthly interest to reduce the balance");
    }
    const finalPayment = emi >= openingBalance + interest;
    const actualEmi = finalPayment ? asPaise(openingBalance + interest) : emi;
    const principalPart = asPaise(actualEmi - interest);
    const closingBalance = finalPayment
      ? asPaise(0)
      : asPaise(openingBalance - principalPart);
    rows.push({
      period: index + 1,
      dueDate: addMonths(firstDueDate, index),
      openingBalance,
      emi: actualEmi,
      principal: principalPart,
      interest,
      closingBalance,
    });
    openingBalance = closingBalance;
  }

  if (openingBalance > 0) {
    throw new Error("Prepayment schedule did not close within the original remaining term");
  }
  return rows;
}

/** Apply a prepayment and recalculate the remaining schedule in the chosen mode. */
export function applyPrepayment(
  schedule: readonly AmortizationPeriod[],
  amount: Paise,
  effectiveDate: IsoDate,
  annualRatePercent: number,
  mode: PrepaymentMode,
): PrepaymentResult {
  if (schedule.length === 0) {
    throw new Error("A prepayment requires a non-empty schedule");
  }
  if (amount <= 0) {
    throw new Error("Prepayment amount must be greater than zero");
  }
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    throw new Error("Annual interest rate must be a finite non-negative number");
  }

  let lastCompletedIndex = -1;
  for (let index = 0; index < schedule.length; index += 1) {
    if (compareIsoDates(schedule[index]!.dueDate, effectiveDate) <= 0) {
      lastCompletedIndex = index;
    } else {
      break;
    }
  }
  const completed = schedule.slice(0, lastCompletedIndex + 1);
  const remaining = schedule.slice(lastCompletedIndex + 1);
  const outstanding =
    lastCompletedIndex < 0
      ? schedule[0]!.openingBalance
      : schedule[lastCompletedIndex]!.closingBalance;

  if (outstanding <= amount) {
    throw new Error("Prepayment must be less than the outstanding principal");
  }
  if (remaining.length === 0) {
    throw new Error("Prepayment date is after the final scheduled installment");
  }

  const reducedBalance = asPaise(outstanding - amount);
  const firstDueDate = remaining[0]!.dueDate;
  const recomputed =
    mode === "reduce-tenure"
      ? scheduleWithFixedEmi(
          reducedBalance,
          annualRatePercent,
          remaining[0]!.emi,
          remaining.length,
          firstDueDate,
        )
      : createAmortizationSchedule({
          principal: reducedBalance,
          annualRatePercent,
          tenureMonths: remaining.length,
          firstDueDate,
        });
  const originalInterest = remaining.reduce((sum, row) => sum + row.interest, 0);
  const newInterest = recomputed.reduce((sum, row) => sum + row.interest, 0);
  return {
    schedule: [...completed, ...recomputed],
    appliedAmount: amount,
    interestSaved: asPaise(originalInterest - newInterest),
    periodsSaved: remaining.length - recomputed.length,
  };
}

/** Recalculate only the EMI while keeping the remaining period count unchanged. */
export function emiForReducedBalance(
  balance: Paise,
  annualRatePercent: number,
  remainingMonths: number,
): Paise {
  return calculateEmi(balance, annualRatePercent, remainingMonths);
}
