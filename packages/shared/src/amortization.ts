import { addMonths, type IsoDate } from "./dates.js";
import { asPaise, roundToPaise, type Paise } from "./money.js";

export interface AmortizationPeriod {
  period: number;
  dueDate: IsoDate;
  openingBalance: Paise;
  emi: Paise;
  principal: Paise;
  interest: Paise;
  closingBalance: Paise;
}

export interface AmortizationInput {
  principal: Paise;
  annualRatePercent: number;
  tenureMonths: number;
  firstDueDate: IsoDate;
}

function validateInput(input: AmortizationInput): void {
  if (input.principal <= 0) {
    throw new Error("Principal must be greater than zero");
  }
  if (!Number.isFinite(input.annualRatePercent) || input.annualRatePercent < 0) {
    throw new Error("Annual interest rate must be a finite non-negative number");
  }
  if (!Number.isInteger(input.tenureMonths) || input.tenureMonths < 1) {
    throw new Error("Tenure must be a positive whole number of months");
  }
}

/** Calculate the regular EMI, rounded to the nearest paisa. */
export function calculateEmi(
  principal: Paise,
  annualRatePercent: number,
  tenureMonths: number,
): Paise {
  validateInput({
    principal,
    annualRatePercent,
    tenureMonths,
    firstDueDate: "2000-01-01" as IsoDate,
  });
  const monthlyRate = annualRatePercent / 1200;
  if (monthlyRate === 0) {
    return roundToPaise(principal / tenureMonths);
  }
  const factor = (1 + monthlyRate) ** tenureMonths;
  const emi = (principal * monthlyRate * factor) / (factor - 1);
  return roundToPaise(emi);
}

/** Build a reducing-balance schedule; interest rounds to paise each period. */
export function createAmortizationSchedule(
  input: AmortizationInput,
): AmortizationPeriod[] {
  validateInput(input);
  const regularEmi = calculateEmi(
    input.principal,
    input.annualRatePercent,
    input.tenureMonths,
  );
  const monthlyRate = input.annualRatePercent / 1200;
  const schedule: AmortizationPeriod[] = [];
  let openingBalance = input.principal;

  for (let index = 0; index < input.tenureMonths && openingBalance > 0; index += 1) {
    const interest = roundToPaise(openingBalance * monthlyRate);
    const dueDate = addMonths(input.firstDueDate, index);
    const isLastPlannedPeriod = index === input.tenureMonths - 1;
    const finalPayment = isLastPlannedPeriod || regularEmi >= openingBalance + interest;
    const emi = finalPayment ? asPaise(openingBalance + interest) : regularEmi;
    const principalPaid = asPaise(emi - interest);
    const closingBalance = finalPayment
      ? asPaise(0)
      : asPaise(openingBalance - principalPaid);

    if (principalPaid <= 0 || closingBalance < 0) {
      throw new Error("Calculated installment does not reduce the principal");
    }
    schedule.push({
      period: index + 1,
      dueDate,
      openingBalance,
      emi,
      principal: principalPaid,
      interest,
      closingBalance,
    });
    openingBalance = closingBalance;
  }
  return schedule;
}

/** Rebuild a schedule with a fixed EMI, allowing the term to change. */
export function createScheduleWithFixedEmi(
  principal: Paise,
  annualRatePercent: number,
  emi: Paise,
  maxMonths: number,
  firstDueDate: IsoDate,
): AmortizationPeriod[] {
  if (principal <= 0 || emi <= 0 || !Number.isInteger(maxMonths) || maxMonths < 1) {
    throw new Error("Principal, EMI, and maximum term must be positive");
  }
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    throw new Error("Annual interest rate must be a finite non-negative number");
  }
  const monthlyRate = annualRatePercent / 1200;
  const schedule: AmortizationPeriod[] = [];
  let openingBalance = principal;

  for (let index = 0; index < maxMonths && openingBalance > 0; index += 1) {
    const interest = roundToPaise(openingBalance * monthlyRate);
    if (emi <= interest) {
      throw new Error("EMI must exceed monthly interest to reduce the balance");
    }
    const isFinal = emi >= openingBalance + interest;
    const periodEmi = isFinal ? asPaise(openingBalance + interest) : emi;
    const principalPaid = asPaise(periodEmi - interest);
    const closingBalance = isFinal
      ? asPaise(0)
      : asPaise(openingBalance - principalPaid);
    schedule.push({
      period: index + 1,
      dueDate: addMonths(firstDueDate, index),
      openingBalance,
      emi: periodEmi,
      principal: principalPaid,
      interest,
      closingBalance,
    });
    openingBalance = closingBalance;
  }
  if (openingBalance > 0) {
    throw new Error("Schedule did not close within the maximum term");
  }
  return schedule;
}
