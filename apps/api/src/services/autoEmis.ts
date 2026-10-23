import {
  addMonths,
  asIsoDate,
  asPaise,
  calculatePaymentBreakdown,
  reconcileAutoEmis,
  type ActivityRecord,
} from "@loan-dashboard/shared";
import type { RepositorySet } from "../db/repositories.js";

function today(): ReturnType<typeof asIsoDate> {
  return asIsoDate(new Date().toISOString().slice(0, 10));
}

function firstDueDate(startDate: string, dueDay: number): ReturnType<typeof asIsoDate> {
  const nextMonth = addMonths(asIsoDate(startDate), 1);
  const [year, month] = nextMonth.split("-").map(Number);
  const day = Math.min(dueDay, new Date(Date.UTC(year!, month!, 0)).getUTCDate())
    .toString().padStart(2, "0");
  return asIsoDate(`${nextMonth.slice(0, 7)}-${day}`);
}

export function reconcileLoanAutoEmis(repositories: RepositorySet, loanId: string) {
  const loan = repositories.loans.getById(loanId);
  if (loan === undefined) return { created: 0, updated: 0 };
  const active = repositories.children.activityEntries.listByLoan(loanId);
  const deleted = repositories.children.activityEntries.listDeleted().filter((entry) => entry.loanId === loanId);
  const entries = [...active, ...deleted] as unknown as ActivityRecord[];
  const disbursements = entries
    .filter((entry) => entry.type === "LOAN_DISBURSEMENT" && entry.amount != null)
    .map((entry) => ({ date: entry.date, amount: asPaise(entry.amount!) }));
  const output = reconcileAutoEmis({
    loanId,
    emiStartDate: loan.emiStartDate === null
      ? firstDueDate(loan.startDate, loan.emiDueDay)
      : asIsoDate(loan.emiStartDate),
    today: today(),
    sanctionedAmount: asPaise(loan.sanctionedAmount),
    annualRatePercent: loan.annualRatePercent,
    tenureMonths: loan.tenureMonths,
    emiBasis: loan.emiBasis,
    interestMethod: loan.interestMethod,
    emiOverride: loan.emiOverride == null ? null : asPaise(loan.emiOverride),
    preEmiInterestOnly: loan.preEmiInterestOnly,
    disbursements,
    entries,
  });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let created = 0;
  let updated = 0;
  repositories.transaction(() => {
    for (const entry of output) {
      if (entry.origin !== "AUTO" || entry.type !== "EMI") continue;
      const existing = byId.get(entry.id);
      if (existing !== undefined) {
        if (existing.userEdited || existing.deletedAt != null) continue;
        repositories.children.activityEntries.update(entry.id, {
          date: entry.date,
          dueDate: entry.dueDate ?? entry.date,
          amount: entry.amount,
          title: entry.title,
          status: entry.status ?? "PAID",
          interestPart: entry.interestPart ?? 0,
          principalPart: entry.principalPart ?? 0,
          updatedAt: new Date().toISOString(),
        });
        updated += 1;
      } else {
        const now = new Date().toISOString();
        repositories.children.activityEntries.create({
          id: entry.id,
          loanId,
          type: "EMI",
          date: entry.date,
          dueDate: entry.dueDate ?? entry.date,
          amount: entry.amount,
          title: entry.title,
          notes: entry.notes ?? null,
          origin: "AUTO",
          userEdited: false,
          deletedAt: null,
          source: null,
          componentId: null,
          trancheLabel: null,
          bankReference: null,
          status: entry.status ?? "PAID",
          mode: null,
          newRatePercent: null,
          effectiveDate: null,
          rateOption: null,
          interestPart: entry.interestPart ?? 0,
          principalPart: entry.principalPart ?? 0,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }
    }
  });
  recalculateActivityPaymentSplits(repositories, loanId);
  return { created, updated };
}

function recalculateActivityPaymentSplits(repositories: RepositorySet, loanId: string): void {
  const loan = repositories.loans.getById(loanId);
  if (loan === undefined) return;
  const entries = repositories.children.activityEntries.listByLoan(loanId);
  const payments = entries
    .filter((entry) => (entry.type === "EMI" || entry.type === "EXTRA_EMI") && entry.amount !== null && entry.status === "PAID")
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  if (payments.length === 0) return;
  const disbursements = entries
    .filter((entry) => entry.type === "LOAN_DISBURSEMENT" && entry.amount !== null)
    .map((entry) => ({ date: asIsoDate(entry.date), amount: asPaise(entry.amount!) }));
  const rateChanges = entries
    .filter((entry) => entry.type === "RATE_CHANGE" && entry.newRatePercent !== null && entry.effectiveDate !== null)
    .map((entry) => ({
      effectiveDate: asIsoDate(entry.effectiveDate!),
      annualRatePercent: entry.newRatePercent!,
      option: entry.rateOption ?? "KEEP_EMI_CHANGE_TENURE",
    }));
  const rows = calculatePaymentBreakdown({
    sanctionedAmount: asPaise(loan.sanctionedAmount),
    annualRatePercent: loan.annualRatePercent,
    tenureMonths: loan.tenureMonths,
    emiBasis: loan.emiBasis,
    interestMethod: loan.interestMethod,
    preEmiInterestOnly: loan.preEmiInterestOnly,
    emiOverride: loan.emiOverride == null ? null : asPaise(loan.emiOverride),
    disbursements,
    payments: payments.map((entry) => ({ date: asIsoDate(entry.date), amount: asPaise(entry.amount!) })),
    rateChanges,
  });
  const now = new Date().toISOString();
  repositories.transaction(() => {
    payments.forEach((entry, index) => {
      const row = rows[index];
      if (row === undefined) return;
      repositories.children.activityEntries.update(entry.id, {
        interestPart: row.interestPart,
        principalPart: row.principalPart,
        updatedAt: now,
      });
    });
  });
}

export function reconcileAllLoanAutoEmis(repositories: RepositorySet): void {
  for (const loan of repositories.loans.listActive()) reconcileLoanAutoEmis(repositories, loan.id);
}