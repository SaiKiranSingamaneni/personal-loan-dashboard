import { addMonths, compareIsoDates, type IsoDate } from "./dates.js";
import {
  calculatePaymentBreakdown,
  type EmiBasis,
  type InterestMethod,
  type PaymentBreakdownInput,
} from "./paymentBreakdown.js";
import { asPaise, type Paise } from "./money.js";

export type ActivityType =
  | "SELF_CONTRIBUTION"
  | "LOAN_DISBURSEMENT"
  | "EMI"
  | "EXTRA_EMI"
  | "RATE_CHANGE";
export type ActivityStatus = "PAID" | "MISSED" | "SKIPPED";
export type ContributionSource = "BANK" | "CASH" | "OTHER";

export interface ActivityRecord {
  id: string;
  loanId: string;
  type: ActivityType;
  date: IsoDate;
  amount: Paise | null;
  title: string;
  notes?: string | null;
  origin: "USER" | "AUTO";
  userEdited: boolean;
  deletedAt?: string | null;
  source?: ContributionSource | null;
  componentId?: string | null;
  status?: ActivityStatus | null;
  dueDate?: IsoDate | null;
  interestPart?: Paise | null;
  principalPart?: Paise | null;
  [key: string]: unknown;
}

export interface AutoEmiInput {
  loanId: string;
  emiStartDate: IsoDate;
  today: IsoDate;
  sanctionedAmount: Paise;
  annualRatePercent: number;
  tenureMonths: number;
  emiBasis: EmiBasis;
  interestMethod?: InterestMethod;
  emiOverride?: Paise | null;
  preEmiInterestOnly?: boolean;
  disbursements: readonly { date: IsoDate; amount: Paise }[];
  entries: readonly ActivityRecord[];
}

function paidAmounts(entries: readonly ActivityRecord[]): { date: IsoDate; amount: Paise }[] {
  return entries
    .filter((entry) =>
      entry.deletedAt == null &&
      (entry.type === "EMI" || entry.type === "EXTRA_EMI") &&
      entry.status === "PAID" && entry.amount != null,
    )
    .map((entry) => ({ date: entry.date, amount: entry.amount! }));
}

function emiAtDate(
  input: AutoEmiInput,
  date: IsoDate,
  previousEntries: readonly ActivityRecord[],
): { amount: Paise; interestPart: Paise; principalPart: Paise } | null {
  const disbursements = input.disbursements.filter(
    (item) => compareIsoDates(item.date, date) <= 0,
  );
  if (disbursements.length === 0) return null;
  const payments = paidAmounts(previousEntries).filter(
    (item) => compareIsoDates(item.date, date) < 0,
  );
  const rateChanges: NonNullable<PaymentBreakdownInput["rateChanges"]> = previousEntries
    .filter((entry) => entry.deletedAt == null && entry.type === "RATE_CHANGE")
    .flatMap((entry) => {
      const effectiveDate = entry.effectiveDate;
      const annualRatePercent = entry.newRatePercent;
      const option = entry.rateOption;
      return typeof effectiveDate === "string" && typeof annualRatePercent === "number" &&
        (option === "KEEP_EMI_CHANGE_TENURE" || option === "KEEP_TENURE_CHANGE_EMI")
        ? [{ effectiveDate: effectiveDate as IsoDate, annualRatePercent, option }]
        : [];
    });
  const options: Omit<PaymentBreakdownInput, "payments"> = {
    sanctionedAmount: input.sanctionedAmount,
    annualRatePercent: input.annualRatePercent,
    tenureMonths: input.tenureMonths,
    disbursements,
    emiBasis: input.emiBasis,
    interestMethod: input.interestMethod,
    preEmiInterestOnly: input.preEmiInterestOnly,
    emiOverride: input.emiOverride,
    rateChanges,
  };
  const estimate = calculatePaymentBreakdown({
    ...options,
    payments: [...payments, { date, amount: asPaise(0) }],
  }).at(-1);
  if (estimate == null || estimate.emiAmount <= 0) return null;
  const split = calculatePaymentBreakdown({
    ...options,
    payments: [...payments, { date, amount: estimate.emiAmount }],
  }).at(-1);
  if (split == null) return null;
  return {
    amount: estimate.emiAmount,
    interestPart: split.interestPart,
    principalPart: split.principalPart,
  };
}

/** Generate or recompute past auto-EMIs without overwriting user edits or tombstones. */
export function reconcileAutoEmis(input: AutoEmiInput): ActivityRecord[] {
  const entries = input.entries.map((entry) => ({ ...entry }));
  const autoByDueDate = new Map(
    entries
      .filter((entry) => entry.origin === "AUTO" && entry.type === "EMI" && entry.dueDate != null)
      .map((entry) => [entry.dueDate!, entry]),
  );
  let index = 0;
  let date = input.emiStartDate;
  while (compareIsoDates(date, input.today) <= 0) {
    const existing = autoByDueDate.get(date);
    if (existing?.deletedAt != null) {
      index += 1;
      date = addMonths(input.emiStartDate, index);
      continue;
    }
    if (existing?.userEdited) {
      index += 1;
      date = addMonths(input.emiStartDate, index);
      continue;
    }
    const split = emiAtDate(input, date, entries);
    if (split != null) {
      const row: ActivityRecord = {
        id: existing?.id ?? `auto-emi:${input.loanId}:${date}`,
        loanId: input.loanId,
        type: "EMI",
        date,
        dueDate: date,
        amount: split.amount,
        title: "Monthly EMI",
        origin: "AUTO",
        userEdited: false,
        status: "PAID",
        interestPart: split.interestPart,
        principalPart: split.principalPart,
        deletedAt: null,
      };
      if (existing == null) {
        entries.push(row);
        autoByDueDate.set(date, row);
      } else {
        Object.assign(existing, row);
      }
    }
    index += 1;
    date = addMonths(input.emiStartDate, index);
    if (index > 1200) throw new Error("EMI start date is too far in the past");
  }
  return entries;
}

export interface PropertyCostRecord {
  id: string;
  group: "AGREEMENT" | "OUTSIDE_AGREEMENT";
  name: string;
  amount: Paise;
}

export interface DashboardSummaryInput {
  sanctionedAmount: Paise;
  emiStartDate: IsoDate;
  annualRatePercent: number;
  tenureMonths: number;
  emiBasis: EmiBasis;
  interestMethod?: InterestMethod;
  emiOverride?: Paise | null;
  preEmiInterestOnly?: boolean;
  disbursements: readonly { date: IsoDate; amount: Paise }[];
  components: readonly PropertyCostRecord[];
  entries: readonly ActivityRecord[];
  asOf: IsoDate;
}

export interface DashboardSummary {
  sanctioned: Paise;
  disbursed: Paise;
  undisbursed: Paise;
  principalRepaid: Paise;
  outstandingPrincipal: Paise;
  interestPaid: Paise;
  nextEmi: { date: IsoDate; amount: Paise } | null;
  totalOutlay: Paise;
  agreementValue: Paise;
  extraCosts: Paise;
  fundingSplit: {
    loanDisbursed: Paise;
    selfBank: Paise;
    cash: Paise;
    remainingToPay: Paise;
  };
  warnings: string[];
}

/** Derive all plain-language dashboard amounts from persisted domain records. */
export function summarizeActivityDashboard(input: DashboardSummaryInput): DashboardSummary {
  const disbursed = input.disbursements
    .filter((item) => compareIsoDates(item.date, input.asOf) <= 0)
    .reduce((sum, item) => sum + item.amount, 0);
  const active = input.entries.filter((entry) => entry.deletedAt == null);
  const paidInstallments = active.filter((entry) =>
    (entry.type === "EMI" || entry.type === "EXTRA_EMI") && entry.status === "PAID",
  );
  const principalRepaid = paidInstallments.reduce(
    (sum, item) => sum + (item.principalPart ?? 0), 0,
  );
  const interestPaid = paidInstallments.reduce(
    (sum, item) => sum + (item.interestPart ?? 0), 0,
  );
  const agreementValue = input.components
    .filter((item) => item.group === "AGREEMENT")
    .reduce((sum, item) => sum + item.amount, 0);
  const extraCosts = input.components
    .filter((item) => item.group === "OUTSIDE_AGREEMENT")
    .reduce((sum, item) => sum + item.amount, 0);
  const asOfEntries = active.filter((entry) => compareIsoDates(entry.date, input.asOf) <= 0);
  const selfBank = asOfEntries
    .filter((item) => item.type === "SELF_CONTRIBUTION" && item.source === "BANK")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const cash = asOfEntries
    .filter((item) => item.type === "SELF_CONTRIBUTION" && item.source === "CASH")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const totalOutlay = agreementValue + extraCosts;
  let nextDueDate = input.emiStartDate;
  let dueCount = 0;
  while (compareIsoDates(nextDueDate, input.asOf) <= 0) {
    dueCount += 1;
    nextDueDate = addMonths(input.emiStartDate, dueCount);
    if (dueCount > 1200) throw new Error("EMI start date is too far in the past");
  }
  const nextSplit = emiAtDate({
    loanId: "dashboard",
    emiStartDate: input.emiStartDate,
    today: input.asOf,
    sanctionedAmount: input.sanctionedAmount,
    annualRatePercent: input.annualRatePercent,
    tenureMonths: input.tenureMonths,
    emiBasis: input.emiBasis,
    interestMethod: input.interestMethod,
    emiOverride: input.emiOverride,
    preEmiInterestOnly: input.preEmiInterestOnly,
    disbursements: input.disbursements,
    entries: active,
  }, nextDueDate, active);
  const warnings: string[] = [];
  if (disbursed > input.sanctionedAmount) warnings.push("Loan disbursed exceeds the sanctioned amount.");
  if (disbursed + selfBank + cash > totalOutlay) warnings.push("Loan disbursed and contributions exceed total property cost.");
  for (const component of input.components) {
    const linked = active
      .filter((entry) => entry.type === "SELF_CONTRIBUTION" && entry.componentId === component.id)
      .reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
    if (linked > component.amount) {
      warnings.push(`Contributions linked to ${component.name} exceed that cost item.`);
    }
  }

  return {
    sanctioned: input.sanctionedAmount,
    disbursed: asPaise(disbursed),
    undisbursed: asPaise(Math.max(0, input.sanctionedAmount - disbursed)),
    principalRepaid: asPaise(principalRepaid),
    outstandingPrincipal: asPaise(Math.max(0, disbursed - principalRepaid)),
    interestPaid: asPaise(interestPaid),
    nextEmi: nextSplit == null ? null : { date: nextDueDate, amount: nextSplit.amount },
    totalOutlay: asPaise(totalOutlay),
    agreementValue: asPaise(agreementValue),
    extraCosts: asPaise(extraCosts),
    fundingSplit: {
      loanDisbursed: asPaise(disbursed),
      selfBank: asPaise(selfBank),
      cash: asPaise(cash),
      remainingToPay: asPaise(Math.max(0, totalOutlay - disbursed - selfBank - cash)),
    },
    warnings,
  };
}