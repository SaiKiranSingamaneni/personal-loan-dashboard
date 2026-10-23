import { asIsoDate, addMonths, type IsoDate } from "./dates.js";
import { calculateEmi } from "./amortization.js";
import { asPaise, roundToPaise, type Paise } from "./money.js";

export type EmiBasis = "SANCTIONED" | "DISBURSED";
export type InterestMethod = "DAILY" | "MONTHLY";
export interface DatedAmount { date: IsoDate; amount: Paise }
export interface PaymentBreakdownInput {
  sanctionedAmount: Paise;
  annualRatePercent: number;
  tenureMonths: number;
  disbursements: readonly DatedAmount[];
  payments: readonly DatedAmount[];
  emiBasis: EmiBasis;
  interestMethod?: InterestMethod;
  preEmiInterestOnly?: boolean;
  emiOverride?: Paise | null;
  rateChanges?: readonly {
    effectiveDate: IsoDate;
    annualRatePercent: number;
    option: "KEEP_EMI_CHANGE_TENURE" | "KEEP_TENURE_CHANGE_EMI";
  }[];
}
export interface PaymentBreakdownRow {
  date: IsoDate;
  amount: Paise;
  interestPart: Paise;
  principalPart: Paise;
  outstandingPrincipal: Paise;
  unpaidInterest: Paise;
  emiAmount: Paise;
  warning: string | null;
}

function dateDays(from: IsoDate, to: IsoDate): number {
  return Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function calendarMonthsBetween(from: IsoDate, to: IsoDate): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return Math.max(0, (toYear! - fromYear!) * 12 + toMonth! - fromMonth!);
}

export function calculatePaymentBreakdown(input: PaymentBreakdownInput): PaymentBreakdownRow[] {
  const events = [
    ...input.disbursements.map((item, index) => ({ ...item, kind: "disbursement" as const, index })),
    ...(input.rateChanges ?? []).map((item, index) => ({
      date: item.effectiveDate,
      amount: asPaise(0),
      kind: "rate-change" as const,
      index,
      annualRatePercent: item.annualRatePercent,
      option: item.option,
    })),
    ...input.payments.map((item, index) => ({ ...item, kind: "payment" as const, index })),
  ].sort((a, b) => a.date.localeCompare(b.date) || eventOrder(a.kind) - eventOrder(b.kind) || a.index - b.index);
  let principal = 0;
  let unpaidInterest = 0;
  let lastDate = events[0]?.date ?? asIsoDate("1970-01-01");
  let accrued = 0;
  let disbursementCount = 0;
  const results: PaymentBreakdownRow[] = [];
  const daily = (input.interestMethod ?? "DAILY") === "DAILY";
  let annualRatePercent = input.annualRatePercent;
  let lastEmiAmount: Paise | null = null;
  let fixedEmiAmount: Paise | null = null;

  for (const event of events) {
    if (daily && event.date > lastDate) {
      accrued += principal * (annualRatePercent / 100) * dateDays(lastDate, event.date) / 365;
    }
    if (event.kind === "rate-change") {
      const firstDisbursement = input.disbursements.map((item) => item.date).sort()[0] ?? event.date;
      const elapsedMonths = calendarMonthsBetween(firstDisbursement, event.date);
      const remainingMonths = Math.max(1, input.tenureMonths - elapsedMonths + 1);
      if (event.option === "KEEP_EMI_CHANGE_TENURE") {
        const emiPrincipal = input.emiBasis === "SANCTIONED" ? input.sanctionedAmount : asPaise(principal);
        fixedEmiAmount = lastEmiAmount ?? (input.emiBasis === "SANCTIONED" && input.emiOverride != null
          ? input.emiOverride
          : emiPrincipal > 0 ? calculateEmi(emiPrincipal, annualRatePercent, remainingMonths) : null);
      } else {
        fixedEmiAmount = null;
      }
      annualRatePercent = event.annualRatePercent;
      lastDate = event.date;
      continue;
    }
    if (event.kind === "disbursement") {
      principal += event.amount;
      disbursementCount += 1;
      lastDate = event.date;
      continue;
    }
    const interestDue = roundToPaise(accrued + unpaidInterest + (!daily ? principal * annualRatePercent / 1200 : 0));
    const interestPart = asPaise(Math.min(event.amount, interestDue));
    const principalPart = asPaise(event.amount - interestPart);
    unpaidInterest = Math.max(0, interestDue - interestPart);
    principal = Math.max(0, principal - principalPart);
    accrued = 0;
    const firstDisbursement = input.disbursements.map((item) => item.date).sort()[0] ?? event.date;
    const elapsedMonths = calendarMonthsBetween(firstDisbursement, event.date);
    const remainingMonths = Math.max(1, input.tenureMonths - elapsedMonths + 1);
    const emiPrincipal = input.emiBasis === "SANCTIONED" ? input.sanctionedAmount : asPaise(principal + principalPart);
    const calculatedEmiAmount = input.emiBasis === "SANCTIONED" && input.emiOverride != null
      ? input.emiOverride
      : calculateEmi(emiPrincipal, annualRatePercent, input.emiBasis === "SANCTIONED" ? input.tenureMonths : remainingMonths);
    const emiAmount: Paise = fixedEmiAmount ?? calculatedEmiAmount;
    const preEmi = input.preEmiInterestOnly === true && principal < input.sanctionedAmount && disbursementCount > 0;
    results.push({
      date: event.date, amount: event.amount, interestPart, principalPart,
      outstandingPrincipal: asPaise(principal), unpaidInterest: asPaise(unpaidInterest),
      emiAmount: preEmi ? asPaise(interestDue) : emiAmount,
      warning: unpaidInterest > 0 ? "Payment is below accrued interest; unpaid interest is carried forward." : null,
    });
    lastEmiAmount = emiAmount;
    lastDate = event.date;
  }
  return results;
}

function eventOrder(kind: "disbursement" | "rate-change" | "payment"): number {
  return kind === "disbursement" ? 0 : kind === "rate-change" ? 1 : 2;
}

export function calculateEmiAtDisbursement(
  outstandingPrincipal: Paise,
  annualRatePercent: number,
  remainingMonths: number,
): Paise {
  return calculateEmi(outstandingPrincipal, annualRatePercent, remainingMonths);
}

export function remainingTenureDate(firstDueDate: IsoDate, months: number): IsoDate {
  return addMonths(firstDueDate, months - 1);
}
