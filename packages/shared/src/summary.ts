import { compareIsoDates, type IsoDate } from "./dates.js";
import type { AmortizationPeriod } from "./amortization.js";
import type { Disbursement } from "./disbursements.js";
import type { RecordedPayment } from "./payments.js";
import { asPaise, type Paise } from "./money.js";

export interface SummaryInput {
  sanctionedAmount: Paise;
  propertyCost?: Paise;
  ownContribution: Paise;
  disbursements: readonly Disbursement[];
  schedule: readonly AmortizationPeriod[];
  payments: readonly RecordedPayment[];
  asOf: IsoDate;
}

export interface LoanSummary {
  ownContributionPercent: number | null;
  loanSharePercent: number | null;
  propertyCostRemaining: Paise | null;
  sanctionedNotDisbursed: Paise;
  outstandingPrincipal: Paise;
  principalRepaid: Paise;
  interestPaidToDate: Paise;
  emi: Paise;
  totalInterest: Paise;
  totalPayable: Paise;
  interestAsPercentOfPrincipal: number;
  nextDueDate: IsoDate | null;
  nextDueAmount: Paise | null;
  emisPaid: number;
  emisRemaining: number;
  projectedClosureDate: IsoDate | null;
  warnings: string[];
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Derive dashboard metrics and funding consistency warnings from domain records. */
export function summarizeLoan(input: SummaryInput): LoanSummary {
  const totalDisbursed = input.disbursements.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const disbursedAsOf = input.disbursements
    .filter((item) => compareIsoDates(item.date, input.asOf) <= 0)
    .reduce((sum, item) => sum + item.amount, 0);
  const paidAsOf = input.payments.filter(
    (payment) =>
      payment.status === "paid" && compareIsoDates(payment.date, input.asOf) <= 0,
  );
  const principalRepaid = paidAsOf.reduce(
    (sum, payment) => sum + payment.principalPart,
    0,
  );
  const interestPaidToDate = paidAsOf.reduce(
    (sum, payment) => sum + payment.interestPart,
    0,
  );
  const outstandingPrincipal = asPaise(disbursedAsOf - principalRepaid);
  const propertyCostRemaining =
    input.propertyCost === undefined
      ? null
      : asPaise(input.propertyCost - input.ownContribution - totalDisbursed);
  const scheduledPeriods = input.schedule.filter((row) => row.principal > 0);
  const paidPeriods = new Set(
    paidAsOf
      .map((payment) => payment.scheduledPeriod)
      .filter((period): period is number => period !== undefined),
  );
  const nextDue = input.schedule.find(
    (row) =>
      compareIsoDates(row.dueDate, input.asOf) >= 0 &&
      !paidPeriods.has(row.period),
  );
  const totalInterest = input.schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalPayable = input.schedule.reduce((sum, row) => sum + row.emi, 0);
  const emiRow = input.schedule.find((row) => row.principal > 0);
  const warnings: string[] = [];

  if (
    input.propertyCost !== undefined &&
    input.ownContribution + totalDisbursed > input.propertyCost
  ) {
    warnings.push("Own contribution and loan utilized exceed the property cost.");
  }
  if (totalDisbursed > input.sanctionedAmount) {
    warnings.push("Total disbursements exceed the sanctioned amount.");
  }
  if (principalRepaid > disbursedAsOf) {
    warnings.push("Recorded principal payments exceed the disbursed outstanding amount.");
  }

  return {
    ownContributionPercent: percent(
      input.ownContribution,
      input.propertyCost ?? 0,
    ),
    loanSharePercent: percent(totalDisbursed, input.propertyCost ?? 0),
    propertyCostRemaining,
    sanctionedNotDisbursed: asPaise(Math.max(0, input.sanctionedAmount - totalDisbursed)),
    outstandingPrincipal,
    principalRepaid: asPaise(principalRepaid),
    interestPaidToDate: asPaise(interestPaidToDate),
    emi: emiRow?.emi ?? asPaise(0),
    totalInterest: asPaise(totalInterest),
    totalPayable: asPaise(totalPayable),
    interestAsPercentOfPrincipal:
      totalDisbursed > 0 ? (totalInterest / totalDisbursed) * 100 : 0,
    nextDueDate: nextDue?.dueDate ?? null,
    nextDueAmount: nextDue?.emi ?? null,
    emisPaid: [...paidPeriods].filter((period) =>
      input.schedule.some((row) => row.period === period && row.principal > 0),
    ).length,
    emisRemaining: Math.max(
      0,
      scheduledPeriods.length -
        [...paidPeriods].filter((period) =>
          input.schedule.some((row) => row.period === period && row.principal > 0),
        ).length,
    ),
    projectedClosureDate: input.schedule.at(-1)?.dueDate ?? null,
    warnings,
  };
}
