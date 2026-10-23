import { addMonths, compareIsoDates, type IsoDate } from "./dates.js";
import {
  createAmortizationSchedule,
  type AmortizationPeriod,
} from "./amortization.js";
import { asPaise, roundToPaise, type Paise } from "./money.js";

export interface Disbursement {
  date: IsoDate;
  amount: Paise;
}

export type EmiStartRule =
  | { type: "full-disbursement" }
  | { type: "date"; date: IsoDate };

export interface StagedScheduleInput {
  sanctionedAmount: Paise;
  annualRatePercent: number;
  tenureMonths: number;
  firstDueDate: IsoDate;
  disbursements: readonly Disbursement[];
  emiStartRule: EmiStartRule;
}

/** Build interest-only pre-EMI rows followed by the reducing-balance EMI schedule. */
export function createStagedDisbursementSchedule(
  input: StagedScheduleInput,
): AmortizationPeriod[] {
  if (input.sanctionedAmount <= 0) {
    throw new Error("Sanctioned amount must be greater than zero");
  }
  if (input.disbursements.length === 0) {
    throw new Error("At least one disbursement is required");
  }
  if (
    input.disbursements.some((disbursement) => disbursement.amount <= 0) ||
    input.disbursements.reduce((sum, item) => sum + item.amount, 0) >
      input.sanctionedAmount
  ) {
    throw new Error("Disbursements must be positive and not exceed the sanctioned amount");
  }

  const disbursements = [...input.disbursements].sort((left, right) =>
    compareIsoDates(left.date, right.date),
  );
  let emiStartDate: IsoDate;
  if (input.emiStartRule.type === "full-disbursement") {
    const totalDisbursed = disbursements.reduce((sum, item) => sum + item.amount, 0);
    if (totalDisbursed !== input.sanctionedAmount) {
      throw new Error("Full-disbursement EMI start requires all sanctioned funds to be disbursed");
    }
    emiStartDate = disbursements.at(-1)!.date;
  } else {
    emiStartDate = input.emiStartRule.date;
    if (disbursements.some((item) => compareIsoDates(item.date, emiStartDate) > 0)) {
      throw new Error("All disbursements must occur by the EMI start date");
    }
  }

  let transitionIndex = 0;
  let transitionDate = input.firstDueDate;
  while (compareIsoDates(transitionDate, emiStartDate) < 0) {
    transitionIndex += 1;
    if (transitionIndex > 1200) {
      throw new Error("EMI start date is too far in the future");
    }
    transitionDate = addMonths(input.firstDueDate, transitionIndex);
  }

  const monthlyRate = input.annualRatePercent / 1200;
  const preEmiRows: AmortizationPeriod[] = [];
  for (let index = 0; index < transitionIndex; index += 1) {
    const dueDate = addMonths(input.firstDueDate, index);
    const disbursedBalance = disbursements
      .filter((item) => compareIsoDates(item.date, dueDate) <= 0)
      .reduce((sum, item) => sum + item.amount, 0);
    const interest = roundToPaise(disbursedBalance * monthlyRate);
    preEmiRows.push({
      period: index + 1,
      dueDate,
      openingBalance: asPaise(disbursedBalance),
      emi: interest,
      principal: asPaise(0),
      interest,
      closingBalance: asPaise(disbursedBalance),
    });
  }

  const principalAtEmiStart = disbursements
    .filter((item) => compareIsoDates(item.date, transitionDate) <= 0)
    .reduce((sum, item) => sum + item.amount, 0);
  if (principalAtEmiStart <= 0) {
    throw new Error("No loan funds have been disbursed by the EMI start date");
  }
  const emiRows = createAmortizationSchedule({
    principal: asPaise(principalAtEmiStart),
    annualRatePercent: input.annualRatePercent,
    tenureMonths: input.tenureMonths,
    firstDueDate: transitionDate,
  }).map((row, index) => ({ ...row, period: transitionIndex + index + 1 }));
  return [...preEmiRows, ...emiRows];
}
