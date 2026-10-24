import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import {
  activityEntryCreateSchema,
  activityQuerySchema,
  addMonths,
  asIsoDate,
  asPaise,
  propertyUpdateSchema,
  summarizeActivityDashboard,
  type ActivityRecord,
  type ActivityType,
} from "@loan-dashboard/shared";
import { HttpError } from "../http/errors.js";
import { parseInput, validateBody } from "../http/validation.js";
import type { RepositorySet } from "../db/repositories.js";
import type { propertyCostComponents } from "../db/schema.js";
import { reconcileLoanAutoEmis } from "../services/autoEmis.js";

function param(request: Request, key: string): string {
  const value = request.params[key];
  if (typeof value !== "string") throw new HttpError(400, "INVALID_ID", `A single ${key} is required.`);
  return value;
}

function requireLoan(repositories: RepositorySet, id: string) {
  const loan = repositories.loans.getById(id);
  if (loan === undefined) throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
  return loan;
}

function firstEmiDate(loan: ReturnType<typeof requireLoan>): ReturnType<typeof asIsoDate> {
  if (loan.emiStartDate !== null) return asIsoDate(loan.emiStartDate);
  const followingMonth = addMonths(asIsoDate(loan.startDate), 1);
  const [year, month] = followingMonth.split("-").map(Number);
  const day = Math.min(loan.emiDueDay, new Date(Date.UTC(year!, month!, 0)).getUTCDate())
    .toString().padStart(2, "0");
  return asIsoDate(`${followingMonth.slice(0, 7)}-${day}`);
}

function asActivity(row: ReturnType<RepositorySet["children"]["activityEntries"]["listByLoan"]>[number]): ActivityRecord {
  return row as unknown as ActivityRecord;
}

function loanDashboard(repositories: RepositorySet, loanId: string) {
  const loan = requireLoan(repositories, loanId);
  const today = asIsoDate(new Date().toISOString().slice(0, 10));
  const entries = repositories.children.activityEntries.listByLoan(loanId).map(asActivity);
  const disbursements = entries
    .filter((item) => item.type === "LOAN_DISBURSEMENT" && item.amount != null)
    .map((item) => ({ date: item.date, amount: asPaise(item.amount!) }));
  const summary = summarizeActivityDashboard({
    sanctionedAmount: asPaise(loan.sanctionedAmount),
    emiStartDate: firstEmiDate(loan),
    annualRatePercent: loan.annualRatePercent,
    tenureMonths: loan.tenureMonths,
    emiBasis: loan.emiBasis,
    interestMethod: loan.interestMethod,
    emiOverride: loan.emiOverride == null ? null : asPaise(loan.emiOverride),
    preEmiInterestOnly: loan.preEmiInterestOnly,
    disbursements,
    components: repositories.children.propertyCosts.listByLoan(loanId).map((item) => ({ ...item, amount: asPaise(item.amount) })),
    propertyDetails: (() => {
      const item = repositories.children.propertyDetails.getByLoan(loanId);
      return item === undefined ? undefined : {
        superBuiltUpSft: item.superBuiltUpSft,
        ratePerSft: asPaise(item.ratePerSft),
        parkingSlots: item.parkingSlots,
        parkingCharges: item.parkingCharges == null ? null : asPaise(item.parkingCharges),
        notedGrandTotal: item.notedGrandTotal == null ? null : asPaise(item.notedGrandTotal),
        notedTotalBeforeCash: item.notedTotalBeforeCash == null ? null : asPaise(item.notedTotalBeforeCash),
        notedFinalCost: item.notedFinalCost == null ? null : asPaise(item.notedFinalCost),
      };
    })(),
    entries,
    asOf: today,
  });
  const invoiceMismatch = loan.invoiceGrandTotal != null && loan.invoiceGrandTotal !== summary.agreementValue
    ? { amount: Math.abs(loan.invoiceGrandTotal - summary.agreementValue), direction: loan.invoiceGrandTotal > summary.agreementValue ? "invoice-higher" : "agreement-higher" }
    : null;
  return { loan, entries, summary, invoiceMismatch };
}

function derived(rows: readonly ActivityRecord[]) {
  const active = rows.filter((item) => item.deletedAt == null);
  return active.reduce((totals, item) => {
    if (item.type === "SELF_CONTRIBUTION") totals.selfContributions += item.amount ?? 0;
    if (item.type === "LOAN_DISBURSEMENT") totals.loanDisbursed += item.amount ?? 0;
    if (item.type === "EMI" && item.status === "PAID") totals.emisPaid += item.amount ?? 0;
    if (item.type === "EXTRA_EMI" && item.status === "PAID") totals.extraPayments += item.amount ?? 0;
    return totals;
  }, { selfContributions: 0, loanDisbursed: 0, emisPaid: 0, extraPayments: 0 });
}

export function createActivityRouter(repositories: RepositorySet): Router {
  const router = Router();

  router.get("/loans/:loanId/activity", (request, response) => {
    const loanId = param(request, "loanId");
    requireLoan(repositories, loanId);
    const query = parseInput(activityQuerySchema, request.query);
    const typeFilter = query.type?.split(",").filter(Boolean) as ActivityType[] | undefined;
    const all = repositories.children.activityEntries.listByLoan(loanId).map(asActivity);
    const matching = all.filter((entry) => {
      if (entry.deletedAt != null) return false;
      if (typeFilter?.length && !typeFilter.includes(entry.type)) return false;
      if (query.from && entry.date < query.from) return false;
      if (query.to && entry.date > query.to) return false;
      if (query.q && !`${entry.title} ${entry.notes ?? ""}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) return false;
      if (query.status === "UPCOMING") return false;
      if (query.status && query.status !== entry.status) return false;
      return true;
    }).sort((a, b) => query.sort === "newest"
      ? b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
      : a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const start = (query.page - 1) * query.pageSize;
    const upcoming = query.status === "UPCOMING" ? loanDashboard(repositories, loanId).summary.nextEmi : null;
    const includeUpcoming = upcoming !== null &&
      (!typeFilter?.length || typeFilter.includes("EMI")) &&
      (!query.from || upcoming.date >= query.from) && (!query.to || upcoming.date <= query.to) &&
      (!query.q || "upcoming emi".includes(query.q.toLocaleLowerCase()));
    const rows = includeUpcoming ? [{
      id: `upcoming:${loanId}:${upcoming.date}`, loanId, type: "EMI" as const,
      date: upcoming.date, dueDate: upcoming.date, amount: upcoming.amount,
      title: "Upcoming EMI", notes: null, origin: "AUTO" as const, userEdited: false,
      deletedAt: null, status: "UPCOMING" as const, interestPart: null, principalPart: null,
    }] : matching;
    response.json({
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
      totals: derived(matching),
    });
  });

  router.post("/loans/:loanId/activity", validateBody(activityEntryCreateSchema), (request, response) => {
    const loanId = param(request, "loanId");
    requireLoan(repositories, loanId);
    const input = parseInput(activityEntryCreateSchema, request.body);
    const now = new Date().toISOString();
    const record = repositories.children.activityEntries.create({
      ...input,
      id: randomUUID(), loanId,
      amount: input.type === "RATE_CHANGE" ? null : input.amount,
      notes: input.notes ?? null,
      origin: "USER", userEdited: true, deletedAt: null,
      source: input.type === "SELF_CONTRIBUTION" ? input.source : null,
      componentId: input.type === "SELF_CONTRIBUTION" ? input.componentId ?? null : null,
      trancheLabel: input.type === "LOAN_DISBURSEMENT" ? input.trancheLabel ?? null : null,
      bankReference: input.type === "LOAN_DISBURSEMENT" ? input.bankReference ?? null : null,
      status: input.type === "EMI" ? input.status : input.type === "EXTRA_EMI" ? "PAID" : null,
      dueDate: input.type === "EMI" ? input.dueDate : null,
      mode: input.type === "EXTRA_EMI" ? input.mode ?? "REDUCE_TENURE" : null,
      newRatePercent: input.type === "RATE_CHANGE" ? input.newRatePercent : null,
      effectiveDate: input.type === "RATE_CHANGE" ? input.effectiveDate : null,
      rateOption: input.type === "RATE_CHANGE" ? input.rateOption : null,
      interestPart: null, principalPart: null,
      createdAt: now, updatedAt: now,
    });
    reconcileLoanAutoEmis(repositories, loanId);
    response.status(201).json(record);
  });

  router.put("/activity/:id", (request, response) => {
    const id = param(request, "id");
    const existing = repositories.children.activityEntries.getById(id);
    if (existing === undefined) throw new HttpError(404, "ENTRY_NOT_FOUND", "Activity entry was not found.");
    const patch = request.body as Record<string, unknown>;
    const type = existing.type;
    const variantFields: Record<string, string[]> = {
      SELF_CONTRIBUTION: ["amount", "source", "componentId"],
      LOAN_DISBURSEMENT: ["amount", "trancheLabel", "bankReference"],
      EMI: ["amount", "status", "dueDate"],
      EXTRA_EMI: ["amount", "mode"],
      RATE_CHANGE: ["newRatePercent", "effectiveDate", "rateOption"],
    };
    const publicFields = ["date", "title", "notes", ...(variantFields[type] ?? [])];
    const existingFields = existing as unknown as Record<string, unknown>;
    const merged = Object.fromEntries(publicFields.map((key) => [key,
      patch[key] === undefined ? existingFields[key] : patch[key],
    ]).filter(([, value]) => value !== undefined));
    merged.type = type;
    const parsed = activityEntryCreateSchema.parse(merged);
    const now = new Date().toISOString();
    const updated = repositories.children.activityEntries.update(id, {
      ...parsed,
      amount: parsed.type === "RATE_CHANGE" ? null : parsed.amount,
      notes: parsed.notes ?? null,
      source: parsed.type === "SELF_CONTRIBUTION" ? parsed.source : null,
      componentId: parsed.type === "SELF_CONTRIBUTION" ? parsed.componentId ?? null : null,
      trancheLabel: parsed.type === "LOAN_DISBURSEMENT" ? parsed.trancheLabel ?? null : null,
      bankReference: parsed.type === "LOAN_DISBURSEMENT" ? parsed.bankReference ?? null : null,
      status: parsed.type === "EMI" ? parsed.status : parsed.type === "EXTRA_EMI" ? "PAID" : null,
      dueDate: parsed.type === "EMI" ? parsed.dueDate : null,
      mode: parsed.type === "EXTRA_EMI" ? parsed.mode ?? "REDUCE_TENURE" : null,
      newRatePercent: parsed.type === "RATE_CHANGE" ? parsed.newRatePercent : null,
      effectiveDate: parsed.type === "RATE_CHANGE" ? parsed.effectiveDate : null,
      rateOption: parsed.type === "RATE_CHANGE" ? parsed.rateOption : null,
      userEdited: true,
      interestPart: existing.interestPart,
      principalPart: existing.principalPart,
      updatedAt: now,
    });
    reconcileLoanAutoEmis(repositories, existing.loanId);
    response.json(updated);
  });

  router.delete("/activity/:id", (request, response) => {
    const id = param(request, "id");
    const existing = repositories.children.activityEntries.getById(id);
    if (existing === undefined) throw new HttpError(404, "ENTRY_NOT_FOUND", "Activity entry was not found.");
    repositories.children.activityEntries.softDelete(id, new Date().toISOString());
    response.status(204).end();
  });

  router.post("/activity/:id/restore", (request, response) => {
    const id = param(request, "id");
    const existing = repositories.children.activityEntries.getDeletedById(id);
    if (existing === undefined) throw new HttpError(404, "TRASH_ENTRY_NOT_FOUND", "Deleted activity entry was not found.");
    repositories.children.activityEntries.restore(id);
    response.status(204).end();
  });

  router.get("/loans/:loanId/property", (request, response) => {
    const loanId = param(request, "loanId");
    const loan = requireLoan(repositories, loanId);
    const details = repositories.children.propertyDetails.getByLoan(loanId);
    response.json({ details: details ?? null, components: repositories.children.propertyCosts.listByLoan(loanId), invoiceGrandTotal: loan.invoiceGrandTotal });
  });

  router.put("/loans/:loanId/property", validateBody(propertyUpdateSchema), (request, response) => {
    const loanId = param(request, "loanId");
    requireLoan(repositories, loanId);
    const input = parseInput(propertyUpdateSchema, request.body);
    const inputs = input.components;
    const existing = repositories.children.propertyCosts.listByLoan(loanId);
    const existingIds = new Set(existing.map((component) => component.id));
    for (const item of inputs) {
      if (item.id !== undefined && !existingIds.has(item.id)) throw new HttpError(400, "INVALID_COMPONENT", "Property cost component does not belong to this loan.");
    }
    const now = new Date().toISOString();
    const components: (typeof propertyCostComponents.$inferInsert)[] = inputs.map((item) => ({
      id: item.id ?? randomUUID(), loanId, name: item.name,
      group: item.group === "OUTSIDE_AGREEMENT" ? (item.kind === "IN_HAND_CASH" ? "CASH" as const : "ADDITIONAL" as const) : item.group,
      kind: (item.kind === "IN_HAND_CASH" ? "CASH_PAYMENT" : item.kind === "OTHER" ? (item.group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL") : (["BASE_PRICE", "GST", "PARKING", "CLUB_HOUSE", "OTHER_AGREEMENT", "CORPUS_FUND", "DOCUMENTATION_DEPOSIT", "OTHER_ADDITIONAL", "CASH_PAYMENT"].includes(item.kind) ? item.kind : item.group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL")) as NonNullable<(typeof propertyCostComponents.$inferInsert)["kind"]>,
      amount: item.amount, note: item.note ?? null,
      createdAt: existing.find((row) => row.id === item.id)?.createdAt ?? now, updatedAt: now,
    }));
    repositories.transaction(() => {
      for (const item of existing) {
        if (!components.some((component) => component.id === item.id)) {
          repositories.children.propertyCosts.deleteById(item.id);
        }
      }
      repositories.children.propertyCosts.upsertMany(components);
      if (input.details !== undefined) {
        const old = repositories.children.propertyDetails.getByLoan(loanId);
        repositories.children.propertyDetails.upsert({
          loanId,
          unitLabel: input.details.unitLabel ?? null,
          superBuiltUpSft: input.details.superBuiltUpSft,
          carpetSft: input.details.carpetSft ?? null,
          ratePerSft: input.details.ratePerSft,
          parkingSlots: input.details.parkingSlots,
          parkingCharges: input.details.parkingCharges ?? null,
          notedGrandTotal: input.details.notedGrandTotal ?? null,
          notedTotalBeforeCash: input.details.notedTotalBeforeCash ?? null,
          notedFinalCost: input.details.notedFinalCost ?? null,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        });
      }
      repositories.loans.update(loanId, {
        invoiceGrandTotal: input.invoiceGrandTotal ?? null,
        updatedAt: now,
      });
    });
    response.json({
      details: repositories.children.propertyDetails.getByLoan(loanId) ?? null,
      components: repositories.children.propertyCosts.listByLoan(loanId),
      invoiceGrandTotal: input.invoiceGrandTotal ?? null,
      invoiceMismatch: input.invoiceGrandTotal == null || input.invoiceGrandTotal === components
        .filter((item) => item.group === "AGREEMENT").reduce((sum, item) => sum + item.amount, 0)
        ? null
        : Math.abs(input.invoiceGrandTotal - components
          .filter((item) => item.group === "AGREEMENT").reduce((sum, item) => sum + item.amount, 0)),
    });
  });

  router.get("/loans/:loanId/dashboard", (request, response) => {
    const loanId = param(request, "loanId");
    const dashboard = loanDashboard(repositories, loanId);
    const propertyTotals = dashboard.summary.propertyCost;
    const propertyDetails = repositories.children.propertyDetails.getByLoan(loanId) ?? null;
    const propertyComponents = repositories.children.propertyCosts.listByLoan(loanId);
    const agreementComponents = propertyComponents.filter((item) => item.group === "AGREEMENT");
    const additionalComponents = propertyComponents.filter((item) => item.group === "ADDITIONAL");
    const cashComponents = propertyComponents.filter((item) => item.group === "CASH");
    const checks = propertyTotals.checks;
    const amountPercent = (amount: number) => propertyTotals.finalCost <= 0 ? 0 : amount / propertyTotals.finalCost * 100;
    const costSlices = propertyComponents.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      group: item.group,
      kind: item.kind,
      percent: amountPercent(item.amount),
    })).sort((left, right) => {
      const groupRank = { AGREEMENT: 0, ADDITIONAL: 1, CASH: 2 };
      const rankDifference = groupRank[left.group] - groupRank[right.group];
      if (rankDifference !== 0) return rankDifference;
      const kindRank = (kind: string | null) => kind === "BASE_PRICE" ? 0 : kind === "GST" ? 2 : 1;
      return kindRank(left.kind) - kindRank(right.kind);
    });
    response.json({
      loan: dashboard.loan,
      summary: dashboard.summary,
      invoiceMismatch: dashboard.invoiceMismatch,
      components: propertyComponents,
      propertyBreakdown: {
        details: propertyDetails,
        components: propertyComponents,
        totals: propertyTotals,
        fundingSplit: {
          loan: propertyTotals.loanShare,
          selfPaidBank: propertyTotals.selfPaidBank,
          cash: propertyTotals.cashTotal,
          finalCost: propertyTotals.finalCost,
        },
        checks,
        popup: {
          costSlices,
          agreement: {
            basePrice: agreementComponents.filter((item) => item.kind === "BASE_PRICE"),
            otherCharges: agreementComponents.filter((item) => item.kind !== "BASE_PRICE" && item.kind !== "GST"),
            gst: propertyTotals.gst,
            preGstSubtotal: propertyTotals.preGstSubtotal,
            grandTotal: propertyTotals.grandTotal,
            loan: propertyTotals.loanShare,
            paidByYou: Math.max(0, propertyTotals.grandTotal - propertyTotals.loanShare),
          },
          additional: {
            items: additionalComponents,
            subtotal: propertyTotals.additionalCharges,
            totalBeforeCash: propertyTotals.totalBeforeCash,
          },
          cash: { items: cashComponents, subtotal: propertyTotals.cashTotal },
          finalCost: propertyTotals.finalCost,
          youPayTotal: asPaise(propertyTotals.selfPaidBank + propertyTotals.cashTotal),
          whoPays: [
            { id: "loan", name: "Loan", amount: propertyTotals.loanShare, percent: amountPercent(propertyTotals.loanShare) },
            { id: "self-paid-bank", name: "Self-paid (bank)", amount: propertyTotals.selfPaidBank, percent: amountPercent(propertyTotals.selfPaidBank) },
            { id: "cash", name: "Cash", amount: propertyTotals.cashTotal, percent: amountPercent(propertyTotals.cashTotal) },
          ],
          propertyFacts: propertyDetails === null ? null : {
            superBuiltUpSft: propertyDetails.superBuiltUpSft,
            ratePerSft: propertyDetails.ratePerSft,
            parkingSlots: propertyDetails.parkingSlots,
          },
          checkDifferences: checks.filter((item) => !item.ok).length,
        },
      },
      recentActivity: dashboard.entries.filter((item) => item.deletedAt == null)
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    });
  });

  router.post("/loans/:loanId/auto-emis/restore", (request, response) => {
    const loanId = param(request, "loanId");
    requireLoan(repositories, loanId);
    const deleted = repositories.children.activityEntries.listDeleted()
      .filter((entry) => entry.loanId === loanId && entry.type === "EMI" && entry.origin === "AUTO");
    repositories.transaction(() => {
      for (const row of deleted) repositories.children.activityEntries.restore(row.id);
    });
    const generated = reconcileLoanAutoEmis(repositories, loanId);
    response.json({ restored: deleted.length, generated: generated.created, updated: generated.updated });
  });

  return router;
}
