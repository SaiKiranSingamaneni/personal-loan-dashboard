import { asIsoDate, compareIsoDates, timelineQuerySchema } from "@loan-dashboard/shared";
import type { IsoDate } from "@loan-dashboard/shared";
import type { RepositorySet } from "../db/repositories.js";
import { HttpError } from "../http/errors.js";
import { parseInput } from "../http/validation.js";

export type TimelineType =
  | "payment"
  | "disbursement"
  | "contribution"
  | "rate-change"
  | "note";

export interface TimelineItem {
  id: string;
  entryId: string;
  type: TimelineType;
  date: IsoDate;
  amount: number | null;
  detail: string;
  status?: string;
  upcoming: boolean;
  overdue: boolean;
}

export function getTimeline(
  repositories: RepositorySet,
  loanId: string,
  queryValue: unknown,
  today: IsoDate = new Date().toISOString().slice(0, 10) as IsoDate,
): TimelineItem[] {
  if (repositories.loans.getById(loanId) === undefined) {
    throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
  }
  const query = parseInput(timelineQuerySchema, queryValue);
  const entries: TimelineItem[] = [
    ...repositories.children.payments.listByLoan(loanId).map((item) => ({
      id: `payment:${item.id}`,
      entryId: item.id,
      type: "payment" as const,
      date: item.date as IsoDate,
      amount: item.amount,
      detail: [item.type, item.note].filter(Boolean).join(" — "),
      status: item.status,
      upcoming: item.date > today,
      overdue: item.status === "scheduled" && item.date < today,
    })),
    ...repositories.children.disbursements.listByLoan(loanId).map((item) => ({
      id: `disbursement:${item.id}`,
      entryId: item.id,
      type: "disbursement" as const,
      date: item.date as IsoDate,
      amount: item.amount,
      detail: item.note ?? "Loan disbursement",
      upcoming: item.date > today,
      overdue: false,
    })),
    ...repositories.children.contributions.listByLoan(loanId).map((item) => ({
      id: `contribution:${item.id}`,
      entryId: item.id,
      type: "contribution" as const,
      date: item.date as IsoDate,
      amount: item.amount,
      detail: item.note ?? "Own contribution",
      upcoming: item.date > today,
      overdue: false,
    })),
    ...repositories.children.rateChanges.listByLoan(loanId).map((item) => ({
      id: `rate-change:${item.id}`,
      entryId: item.id,
      type: "rate-change" as const,
      date: item.effectiveDate as IsoDate,
      amount: null,
      detail: `${item.annualRatePercent}% · ${item.mode}`,
      upcoming: item.effectiveDate > today,
      overdue: false,
    })),
    ...repositories.children.notes.listByLoan(loanId).map((item) => ({
      id: `note:${item.id}`,
      entryId: item.id,
      type: "note" as const,
      date: item.date as IsoDate,
      amount: null,
      detail: item.text,
      upcoming: item.date > today,
      overdue: false,
    })),
  ];

  const filtered = entries.filter((item) => {
    if (query.type !== undefined && item.type !== query.type) {
      return false;
    }
    if (query.from !== undefined && compareIsoDates(item.date, asIsoDate(query.from)) < 0) {
      return false;
    }
    if (query.to !== undefined && compareIsoDates(item.date, asIsoDate(query.to)) > 0) {
      return false;
    }
    if (query.q !== undefined && !`${item.type} ${item.detail} ${item.amount ?? ""}`.toLowerCase().includes(query.q.toLowerCase())) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    const dateOrder = compareIsoDates(left.date, right.date);
    const tieOrder = left.id.localeCompare(right.id);
    return query.order === "asc" ? dateOrder || tieOrder : -dateOrder || -tieOrder;
  });
}
