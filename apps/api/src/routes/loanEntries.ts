import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import type { ZodType } from "zod";
import {
  contributionCreateSchema,
  contributionUpdateSchema,
  disbursementCreateSchema,
  disbursementUpdateSchema,
  noteCreateSchema,
  noteUpdateSchema,
  paymentCreateSchema,
  paymentUpdateSchema,
  rateChangeCreateSchema,
  rateChangeUpdateSchema,
} from "@loan-dashboard/shared";
import { HttpError } from "../http/errors.js";
import { parseInput, validateBody } from "../http/validation.js";
import type {
  LoanScopedRepository,
  RepositorySet,
} from "../db/repositories.js";

interface ChildRecord {
  id: string;
  loanId: string;
  deletedAt: string | null;
  version: number;
}

interface ResourceConfig<
  TInput,
  TUpdateInput,
  TRecord extends ChildRecord,
  TCreate,
  TUpdate,
> {
  path: string;
  repository: LoanScopedRepository<TRecord, TCreate, TUpdate>;
  createSchema: ZodType<TInput>;
  updateSchema: ZodType<TUpdateInput>;
  ensureLoan(loanId: string): void;
  makeCreate(input: TInput, loanId: string, id: string, now: string): TCreate;
  makeUpdate(input: TUpdateInput, now: string): TUpdate;
  beforeCreate?(input: TInput, loanId: string): void;
  beforeUpdate?(input: TUpdateInput, existing: TRecord): void;
}

function requiredParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_ID", `A single ${name} is required.`);
  }
  return value;
}

function expectedVersion(request: Request, current: { version: number }): number {
  const value = request.header("If-Match")?.replace(/^W\//, "").replaceAll('"', "");
  if (value === undefined) return current.version;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(400, "INVALID_VERSION", "If-Match must contain a positive record version.");
  }
  return parsed;
}

function staleWrite(): HttpError {
  return new HttpError(409, "STALE_WRITE", "This entry was changed elsewhere. Reload to see the latest.");
}

function createResourceRoutes<
  TInput,
  TUpdateInput,
  TRecord extends ChildRecord,
  TCreate,
  TUpdate,
>(config: ResourceConfig<TInput, TUpdateInput, TRecord, TCreate, TUpdate>) {
  const collection = Router();
  const item = Router();

  collection.get(`/:loanId/${config.path}`, (request, response) => {
    const loanId = requiredParam(request, "loanId");
    config.ensureLoan(loanId);
    response.json(config.repository.listByLoan(loanId));
  });
  collection.post(
    `/:loanId/${config.path}`,
    validateBody(config.createSchema),
    (request, response) => {
      const loanId = requiredParam(request, "loanId");
      config.ensureLoan(loanId);
      const input = parseInput(config.createSchema, request.body);
      config.beforeCreate?.(input, loanId);
      const record = config.repository.create(
        config.makeCreate(input, loanId, randomUUID(), new Date().toISOString()),
      );
      response.status(201).json(record);
    },
  );

  item.get("/:id", (request, response) => {
    const record = config.repository.getById(requiredParam(request, "id"));
    if (record === undefined) {
      throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    }
    response.json(record);
  });
  item.put("/:id", validateBody(config.updateSchema), (request, response) => {
    const id = requiredParam(request, "id");
    const existing = config.repository.getById(id);
    if (existing === undefined) {
      throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    }
    const input = parseInput(config.updateSchema, request.body);
    config.beforeUpdate?.(input, existing);
    const updated = config.repository.update(id, config.makeUpdate(input, new Date().toISOString()), expectedVersion(request, existing));
    if (updated === undefined) {
      if (config.repository.getById(id) !== undefined) throw staleWrite();
      throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    }
    response.json(updated);
  });
  item.delete("/:id", (request, response) => {
    const id = requiredParam(request, "id");
    if (config.repository.getById(id) === undefined) {
      throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    }
    const existing = config.repository.getById(id);
    if (existing === undefined) throw new HttpError(404, "ENTRY_NOT_FOUND", "Entry was not found.");
    if (!config.repository.softDelete(id, new Date().toISOString(), expectedVersion(request, existing))) throw staleWrite();
    response.status(204).end();
  });
  return { collection, item };
}

export interface LoanEntryRouters {
  collections: Router;
  payments: Router;
  disbursements: Router;
  contributions: Router;
  rateChanges: Router;
  notes: Router;
}

export function createLoanEntryRouters(
  repositories: RepositorySet,
  ensureLoan: (id: string) => void,
): LoanEntryRouters {
  const timestampFields = (now: string) => ({
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const payments = createResourceRoutes({
    path: "payments",
    repository: repositories.children.payments,
    createSchema: paymentCreateSchema,
    updateSchema: paymentUpdateSchema,
    ensureLoan,
    makeCreate: (input, loanId, id, now) => ({
      ...input,
      id,
      loanId,
      scheduledPeriod: input.scheduledPeriod ?? null,
      prepaymentMode: input.prepaymentMode ?? null,
      note: input.note ?? null,
      ...timestampFields(now),
    }),
    makeUpdate: (input, now) => ({ ...input, updatedAt: now }),
    beforeUpdate: (input, existing) => {
      paymentCreateSchema.parse({
        date: input.date ?? existing.date,
        amount: input.amount ?? existing.amount,
        type: input.type ?? existing.type,
        principalPart: input.principalPart ?? existing.principalPart,
        interestPart: input.interestPart ?? existing.interestPart,
        status: input.status ?? existing.status,
        scheduledPeriod: input.scheduledPeriod ?? existing.scheduledPeriod,
        prepaymentMode: input.prepaymentMode ?? existing.prepaymentMode,
        note: input.note ?? existing.note,
      });
    },
  });

  const disbursements = createResourceRoutes({
    path: "disbursements",
    repository: repositories.children.disbursements,
    createSchema: disbursementCreateSchema,
    updateSchema: disbursementUpdateSchema,
    ensureLoan,
    makeCreate: (input, loanId, id, now) => ({
      ...input,
      id,
      loanId,
      note: input.note ?? null,
      ...timestampFields(now),
    }),
    makeUpdate: (input, now) => ({ ...input, updatedAt: now }),
  });

  const contributions = createResourceRoutes({
    path: "contributions",
    repository: repositories.children.contributions,
    createSchema: contributionCreateSchema,
    updateSchema: contributionUpdateSchema,
    ensureLoan,
    makeCreate: (input, loanId, id, now) => ({
      ...input,
      id,
      loanId,
      note: input.note ?? null,
      ...timestampFields(now),
    }),
    makeUpdate: (input, now) => ({ ...input, updatedAt: now }),
  });

  const rateChanges = createResourceRoutes({
    path: "rate-changes",
    repository: repositories.children.rateChanges,
    createSchema: rateChangeCreateSchema,
    updateSchema: rateChangeUpdateSchema,
    ensureLoan,
    makeCreate: (input, loanId, id, now) => ({
      ...input,
      id,
      loanId,
      ...timestampFields(now),
    }),
    makeUpdate: (input, now) => ({ ...input, updatedAt: now }),
  });

  const notes = createResourceRoutes({
    path: "notes",
    repository: repositories.children.notes,
    createSchema: noteCreateSchema,
    updateSchema: noteUpdateSchema,
    ensureLoan,
    makeCreate: (input, loanId, id, now) => ({
      ...input,
      id,
      loanId,
      paymentId: input.paymentId ?? null,
      ...timestampFields(now),
    }),
    makeUpdate: (input, now) => ({ ...input, updatedAt: now }),
    beforeCreate: (input, loanId) => {
      ensureLoan(loanId);
      if (input.paymentId !== undefined && input.paymentId !== null) {
        const payment = repositories.children.payments.getById(input.paymentId);
        if (payment?.loanId !== loanId) {
          throw new HttpError(400, "INVALID_PAYMENT_LINK", "Linked payment must belong to this loan.");
        }
      }
    },
    beforeUpdate: (input, existing) => {
      if (input.paymentId !== undefined && input.paymentId !== null) {
        const payment = repositories.children.payments.getById(input.paymentId);
        if (payment?.loanId !== existing.loanId) {
          throw new HttpError(400, "INVALID_PAYMENT_LINK", "Linked payment must belong to this loan.");
        }
      }
    },
  });

  const collections = Router();
  collections.use(payments.collection);
  collections.use(disbursements.collection);
  collections.use(contributions.collection);
  collections.use(rateChanges.collection);
  collections.use(notes.collection);
  return {
    collections,
    payments: payments.item,
    disbursements: disbursements.item,
    contributions: contributions.item,
    rateChanges: rateChanges.item,
    notes: notes.item,
  };
}
