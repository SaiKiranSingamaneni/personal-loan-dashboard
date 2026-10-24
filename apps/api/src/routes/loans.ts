import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { addMonths, asIsoDate } from "@loan-dashboard/shared";
import {
  applyRateChanges,
  calculatePaymentBreakdown,
  asPaise,
  createAmortizationSchedule,
  createScheduleWithFixedEmi,
  createStagedDisbursementSchedule,
  loanCreateSchema,
  loanEditSchema,
  summarizeLoan,
  simulationScenarioSchema,
  type SimulationScenarioInput,
} from "@loan-dashboard/shared";
import type { LoanCreateInput, LoanEditInput } from "@loan-dashboard/shared";
import { HttpError } from "../http/errors.js";
import { validateBody } from "../http/validation.js";
import { parseInput } from "../http/validation.js";
import type { RepositorySet } from "../db/repositories.js";
import { getTimeline } from "./timeline.js";
import { reconcileLoanAutoEmis } from "../services/autoEmis.js";

function getLoan(repositories: RepositorySet, id: string) {
  const loan = repositories.loans.getById(id);
  if (loan === undefined) {
    throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
  }
  return loan;
}

function routeId(request: Request): string {
  const id = request.params.id;
  if (typeof id !== "string") {
    throw new HttpError(400, "INVALID_ID", "A single loan id is required.");
  }
  return id;
}

function expectedVersion(request: Request, currentVersion: number): number {
  const value = request.header("If-Match")?.replace(/^W\//, "").replaceAll('"', "");
  if (value === undefined) return currentVersion;
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new HttpError(400, "INVALID_VERSION", "If-Match must contain a positive record version.");
  return version;
}

function staleWrite(): HttpError {
  return new HttpError(409, "STALE_WRITE", "This entry was changed elsewhere. Reload to see the latest.");
}

function firstDueDate(startDate: string, dueDay: number) {
  const start = asIsoDate(startDate);
  const followingMonth = addMonths(start, 1);
  const [year, month] = followingMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay).toString().padStart(2, "0");
  return asIsoDate(`${followingMonth.slice(0, 7)}-${day}`);
}

function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loanSchedule(repositories: RepositorySet, loanId: string) {
  const loan = getLoan(repositories, loanId);
  const disbursements = repositories.children.disbursements.listByLoan(loanId);
  const totalDisbursed = disbursements.reduce((sum, row) => sum + row.amount, 0);
  const schedulePrincipal = loan.emiBasis === "SANCTIONED"
    ? loan.sanctionedAmount
    : totalDisbursed > 0 ? totalDisbursed : loan.sanctionedAmount;
  const firstDate = firstDueDate(loan.startDate, loan.emiDueDay);
  const staged = loan.emiBasis === "DISBURSED" && disbursements.length > 0 &&
    (loan.emiStartRule === "date" || totalDisbursed === loan.sanctionedAmount);
  let schedule = staged
    ? createStagedDisbursementSchedule({
        sanctionedAmount: asPaise(loan.sanctionedAmount),
        annualRatePercent: loan.annualRatePercent,
        tenureMonths: loan.tenureMonths,
        firstDueDate: firstDate,
        disbursements: disbursements.map((row) => ({
          date: asIsoDate(row.date),
          amount: asPaise(row.amount),
        })),
        emiStartRule:
          loan.emiStartRule === "date" && loan.emiStartDate !== null
            ? { type: "date", date: asIsoDate(loan.emiStartDate) }
            : { type: "full-disbursement" },
      })
    : createAmortizationSchedule({
        principal: asPaise(schedulePrincipal),
        annualRatePercent: loan.annualRatePercent,
        tenureMonths: loan.tenureMonths,
        firstDueDate: firstDate,
      });

  const rateChanges = repositories.children.rateChanges.listByLoan(loanId);
  if (rateChanges.length > 0) {
    schedule = applyRateChanges(
      schedule,
      loan.annualRatePercent,
      rateChanges.map((change) => ({
        effectiveDate: asIsoDate(change.effectiveDate),
        annualRatePercent: change.annualRatePercent,
        mode: change.mode,
      })),
    );
  }
  if (loan.emiOverride !== null && loan.emiOverride !== undefined) {
    const firstPrincipalRow = schedule.findIndex((row) => row.principal > 0);
    if (firstPrincipalRow >= 0) {
      const prefix = schedule.slice(0, firstPrincipalRow);
      const remaining = schedule.slice(firstPrincipalRow);
      const overridden = createScheduleWithFixedEmi(
        asPaise(remaining[0]!.openingBalance),
        loan.annualRatePercent,
        asPaise(loan.emiOverride),
        1200,
        remaining[0]!.dueDate,
      ).map((row, index) => ({
        ...row,
        period: firstPrincipalRow + index + 1,
      }));
      schedule = [...prefix, ...overridden];
    }
  }
  return { loan, schedule, disbursements };
}

function createLoanRecord(input: LoanCreateInput, now: string) {
  const {
    initialOwnContribution: _initialOwnContribution,
    initialLoanUtilized: _initialLoanUtilized,
    ...loanInput
  } = input;
  void _initialOwnContribution;
  void _initialLoanUtilized;
  return {
    id: randomUUID(),
    ...loanInput,
    accountReference: loanInput.accountReference ?? null,
    emiOverride: loanInput.emiOverride ?? null,
    processingFee: loanInput.processingFee ?? null,
    otherCharges: loanInput.otherCharges ?? null,
    propertyCost: loanInput.propertyCost ?? null,
    emiStartDate: loanInput.emiStartDate ?? null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createLoansRouter(repositories: RepositorySet): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json(repositories.loans.list());
  });

  router.post("/:id/payments/generate-scheduled", (request, response) => {
    const id = routeId(request);
    const { schedule } = loanSchedule(repositories, id);
    const existingByPeriod = new Map(
      repositories.children.payments.listByLoan(id)
        .filter((payment) => payment.scheduledPeriod !== null)
        .map((payment) => [payment.scheduledPeriod!, payment]),
    );
    const now = new Date().toISOString();
    const today = localTodayIso();
    let created = 0;
    let updated = 0;
    repositories.transaction(() => {
      for (const row of schedule) {
        const existing = existingByPeriod.get(row.period);
        if (existing !== undefined) {
          if (existing.type === "emi" && existing.status === "scheduled") {
            repositories.children.payments.update(existing.id, {
              date: row.dueDate,
              amount: row.emi,
              principalPart: row.principal,
              interestPart: row.interest,
              ...(row.dueDate <= today ? { status: "paid" as const } : {}),
              updatedAt: now,
            });
            updated += 1;
          }
          continue;
        }
        repositories.children.payments.create({
          id: randomUUID(),
          loanId: id,
          date: row.dueDate,
          amount: row.emi,
          type: "emi",
          principalPart: row.principal,
          interestPart: row.interest,
          status: row.dueDate <= today ? "paid" : "scheduled",
          scheduledPeriod: row.period,
          prepaymentMode: null,
          note: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }
    });
    response.json({ created, updated, total: schedule.length });
  });

  router.post("/:id/apply-simulation", validateBody(simulationScenarioSchema), (request, response) => {
    const id = routeId(request);
    getLoan(repositories, id);
    const scenario = parseInput(simulationScenarioSchema, request.body) as SimulationScenarioInput;
    const now = new Date().toISOString();
    const applied = repositories.transaction(() => {
      if (scenario.type === "prepayment") {
        return [repositories.children.payments.create({
          id: randomUUID(), loanId: id, date: scenario.date, amount: scenario.amount,
          type: "prepayment", principalPart: scenario.amount, interestPart: 0,
          status: "paid", scheduledPeriod: null, prepaymentMode: scenario.mode,
          note: "Applied from what-if simulator", deletedAt: null, createdAt: now, updatedAt: now,
        })];
      }
      if (scenario.type === "recurring-prepayment") {
        return Array.from({ length: scenario.count }, (_value, index) => {
          const date = addMonths(asIsoDate(scenario.firstDate), index * scenario.intervalMonths);
          return repositories.children.payments.create({
            id: randomUUID(), loanId: id, date, amount: scenario.amount,
            type: "prepayment", principalPart: scenario.amount, interestPart: 0,
            status: "paid", scheduledPeriod: null, prepaymentMode: scenario.mode,
            note: "Recurring prepayment from what-if simulator", deletedAt: null, createdAt: now, updatedAt: now,
          });
        });
      }
      return scenario.changes.map((change) => repositories.children.rateChanges.create({
        id: randomUUID(), loanId: id, ...change, deletedAt: null, createdAt: now, updatedAt: now,
      }));
    });
    response.status(201).json({ applied: applied.length, entries: applied });
  });

  router.post("/", validateBody(loanCreateSchema), (request, response) => {
    const input = request.body as LoanCreateInput;
    const now = new Date().toISOString();
    const loan = repositories.transaction(() => {
      const created = repositories.loans.create(createLoanRecord(input, now));
      if (input.initialOwnContribution > 0) {
        const contributionId = randomUUID();
        repositories.children.contributions.create({
          id: contributionId,
          loanId: created.id,
          date: created.startDate,
          amount: input.initialOwnContribution,
          note: "Initial own contribution",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        repositories.children.activityEntries.create({
          id: contributionId, loanId: created.id, type: "SELF_CONTRIBUTION", date: created.startDate,
          amount: input.initialOwnContribution, title: "Initial self contribution", notes: "Initial own contribution",
          origin: "USER", userEdited: true, deletedAt: null, source: "OTHER", componentId: null,
          trancheLabel: null, bankReference: null, status: null, dueDate: null, mode: null,
          newRatePercent: null, effectiveDate: null, rateOption: null, interestPart: null, principalPart: null,
          createdAt: now, updatedAt: now,
        });
      }
      if (input.initialLoanUtilized > 0) {
        const disbursementId = randomUUID();
        repositories.children.disbursements.create({
          id: disbursementId,
          loanId: created.id,
          date: created.startDate,
          amount: input.initialLoanUtilized,
          note: "Initial loan utilization",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        repositories.children.activityEntries.create({
          id: disbursementId, loanId: created.id, type: "LOAN_DISBURSEMENT", date: created.startDate,
          amount: input.initialLoanUtilized, title: "Initial loan disbursement", notes: "Initial loan utilization",
          origin: "USER", userEdited: true, deletedAt: null, source: null, componentId: null,
          trancheLabel: null, bankReference: null, status: null, dueDate: null, mode: null,
          newRatePercent: null, effectiveDate: null, rateOption: null, interestPart: null, principalPart: null,
          createdAt: now, updatedAt: now,
        });
      }
      return created;
    });
    reconcileLoanAutoEmis(repositories, loan.id);
    response.status(201).json(loan);
  });

  router.get("/:id/summary", (request, response) => {
    const id = routeId(request);
    const { loan, schedule, disbursements } = loanSchedule(repositories, id);
    const contributions = repositories.children.contributions.listByLoan(loan.id);
    const payments = repositories.children.payments.listByLoan(loan.id);
    const summary = summarizeLoan({
      sanctionedAmount: asPaise(loan.sanctionedAmount),
      propertyCost:
        loan.propertyCost === null ? undefined : asPaise(loan.propertyCost),
      ownContribution: asPaise(
        contributions.reduce((sum, item) => sum + item.amount, 0),
      ),
      disbursements: disbursements.map((row) => ({
        date: asIsoDate(row.date),
        amount: asPaise(row.amount),
      })),
      schedule,
      payments: payments.map((row) => ({
        date: asIsoDate(row.date),
        amount: asPaise(row.amount),
        principalPart: asPaise(row.principalPart),
        interestPart: asPaise(row.interestPart),
        status: row.status,
        scheduledPeriod: row.scheduledPeriod ?? undefined,
      })),
      asOf: asIsoDate(new Date().toISOString().slice(0, 10)),
    });
    response.json({ loan, summary });
  });

  router.get("/:id/schedule", (request, response) => {
    const id = routeId(request);
    const { schedule } = loanSchedule(repositories, id);
    const payments = repositories.children.payments.listByLoan(id);
    const statusByPeriod = new Map(
      payments
        .filter((payment) => payment.scheduledPeriod !== null)
        .map((payment) => [payment.scheduledPeriod!, payment.status]),
    );
    response.json(
      schedule.map((row) => ({
        ...row,
        status: statusByPeriod.get(row.period) ?? "scheduled",
      })),
    );
  });

  router.get("/:id/payment-breakdown", (request, response) => {
    const id = routeId(request);
    const { loan } = loanSchedule(repositories, id);
    const disbursements = repositories.children.disbursements.listByLoan(id);
    const payments = repositories.children.payments.listByLoan(id);
    const rows = calculatePaymentBreakdown({
      sanctionedAmount: asPaise(loan.sanctionedAmount),
      annualRatePercent: loan.annualRatePercent,
      tenureMonths: loan.tenureMonths,
      emiBasis: loan.emiBasis,
      interestMethod: loan.interestMethod,
      preEmiInterestOnly: loan.preEmiInterestOnly,
      emiOverride: loan.emiOverride == null ? null : asPaise(loan.emiOverride),
      disbursements: disbursements.map((item) => ({ date: asIsoDate(item.date), amount: asPaise(item.amount) })),
      payments: payments.map((item) => ({ date: asIsoDate(item.date), amount: asPaise(item.amount) })),
    });
    const disbursed = disbursements.reduce((sum, item) => sum + item.amount, 0);
    response.json({
      disbursed: asPaise(disbursed),
      undisbursed: asPaise(Math.max(0, loan.sanctionedAmount - disbursed)),
      outstanding: rows.at(-1)?.outstandingPrincipal ?? asPaise(disbursed),
      unpaidInterest: rows.at(-1)?.unpaidInterest ?? asPaise(0),
      rows,
    });
  });

  router.get("/:id/timeline", (request, response) => {
    response.json(getTimeline(repositories, routeId(request), request.query));
  });

  router.get("/:id", (request, response) => {
    response.json(getLoan(repositories, routeId(request)));
  });

  router.put("/:id", validateBody(loanEditSchema), (request, response) => {
    const id = routeId(request);
    const loan = getLoan(repositories, id);
    const input = request.body as LoanEditInput;
    const {
      initialOwnContribution,
      initialLoanUtilized,
      ...loanFields
    } = input;
    const now = new Date().toISOString();
    const updated = repositories.transaction(() => {
      const updatedLoan = repositories.loans.update(id, {
        ...loanFields,
        updatedAt: now,
      }, expectedVersion(request, loan.version));
      if (initialOwnContribution !== undefined) {
        for (const item of repositories.children.contributions.listByLoan(id)) {
          repositories.children.contributions.softDelete(item.id, now);
        }
        if (initialOwnContribution > 0) {
          repositories.children.contributions.create({
            id: randomUUID(),
            loanId: id,
            date: loanFields.startDate ?? loan.startDate,
            amount: initialOwnContribution,
            note: "Updated own contribution total",
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      if (initialLoanUtilized !== undefined) {
        for (const item of repositories.children.disbursements.listByLoan(id)) {
          repositories.children.disbursements.softDelete(item.id, now);
        }
        if (initialLoanUtilized > 0) {
          repositories.children.disbursements.create({
            id: randomUUID(),
            loanId: id,
            date: loanFields.startDate ?? loan.startDate,
            amount: initialLoanUtilized,
            note: "Updated loan utilization total",
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      return updatedLoan;
    });
    if (updated === undefined) {
      if (repositories.loans.getById(id) !== undefined) throw staleWrite();
      throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
    }
    reconcileLoanAutoEmis(repositories, id);
    response.json(updated);
  });

  router.post("/:id/archive", (request, response) => {
    const loan = getLoan(repositories, routeId(request));
    const archived = repositories.loans.update(loan.id, {
      archivedAt: new Date().toISOString(),
    });
    response.json(archived);
  });

  router.delete("/:id", (request, response) => {
    const id = routeId(request);
    getLoan(repositories, id);
    const removed = repositories.loans.softDelete(
      id,
      new Date().toISOString(),
      expectedVersion(request, getLoan(repositories, id).version),
    );
    if (!removed) {
      if (repositories.loans.getById(id) !== undefined) throw staleWrite();
      throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
    }
    response.status(204).end();
  });

  return router;
}
