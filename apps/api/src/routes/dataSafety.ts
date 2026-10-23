import { Router, type Request } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { exportAllData, importAllData, importRequestSchema } from "../db/dataTransfer.js";
import type { RepositorySet } from "../db/repositories.js";
import { HttpError } from "../http/errors.js";
import { parseInput, validateBody } from "../http/validation.js";

const trashTypeSchema = z.enum([
  "loan",
  "payment",
  "disbursement",
  "contribution",
  "rate-change",
  "note",
]);
const permanentDeleteSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_ID", `A single ${name} is required.`);
  }
  return value;
}

function isDeleted(repositories: RepositorySet, type: z.infer<typeof trashTypeSchema>, id: string): boolean {
  switch (type) {
    case "loan":
      return repositories.loans.getDeletedById(id) !== undefined;
    case "payment":
      return repositories.children.payments.getDeletedById(id) !== undefined;
    case "disbursement":
      return repositories.children.disbursements.getDeletedById(id) !== undefined;
    case "contribution":
      return repositories.children.contributions.getDeletedById(id) !== undefined;
    case "rate-change":
      return repositories.children.rateChanges.getDeletedById(id) !== undefined;
    case "note":
      return repositories.children.notes.getDeletedById(id) !== undefined;
  }
}

function restore(repositories: RepositorySet, type: z.infer<typeof trashTypeSchema>, id: string): boolean {
  switch (type) {
    case "loan": return repositories.loans.restore(id);
    case "payment": return repositories.children.payments.restore(id);
    case "disbursement": return repositories.children.disbursements.restore(id);
    case "contribution": return repositories.children.contributions.restore(id);
    case "rate-change": return repositories.children.rateChanges.restore(id);
    case "note": return repositories.children.notes.restore(id);
  }
}

function hardDelete(repositories: RepositorySet, type: z.infer<typeof trashTypeSchema>, id: string): boolean {
  switch (type) {
    case "loan": return repositories.loans.hardDelete(id);
    case "payment": return repositories.children.payments.hardDelete(id);
    case "disbursement": return repositories.children.disbursements.hardDelete(id);
    case "contribution": return repositories.children.contributions.hardDelete(id);
    case "rate-change": return repositories.children.rateChanges.hardDelete(id);
    case "note": return repositories.children.notes.hardDelete(id);
  }
}

export function createDataSafetyRouter(
  database: Database.Database,
  repositories: RepositorySet,
): Router {
  const router = Router();
  router.get("/export", (_request, response) => {
    response.json(exportAllData(database));
  });
  router.post("/import", validateBody(importRequestSchema), (request, response) => {
    const input = parseInput(importRequestSchema, request.body);
    try {
      response.json(importAllData(database, input.data, input.mode));
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw error;
      }
      throw new HttpError(
        400,
        "INVALID_IMPORT_RELATIONSHIP",
        error instanceof Error ? error.message : "Import relationships are invalid.",
      );
    }
  });

  router.get("/trash", (_request, response) => {
    const data = exportAllData(database);
    response.json([
      ...data.loans.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "loan", ...item })),
      ...data.payments.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "payment", ...item })),
      ...data.disbursements.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "disbursement", ...item })),
      ...data.contributions.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "contribution", ...item })),
      ...data.rateChanges.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "rate-change", ...item })),
      ...data.notes.filter((item) => item.deletedAt !== null).map((item) => ({ entityType: "note", ...item })),
    ]);
  });

  router.post("/trash/:type/:id/restore", (request, response) => {
    const type = trashTypeSchema.parse(routeParam(request, "type"));
    const id = routeParam(request, "id");
    if (!isDeleted(repositories, type, id)) {
      throw new HttpError(404, "TRASH_ENTRY_NOT_FOUND", "Deleted entry was not found.");
    }
    restore(repositories, type, id);
    response.status(204).end();
  });

  router.delete(
    "/trash/:type/:id",
    validateBody(permanentDeleteSchema),
    (request, response) => {
      parseInput(permanentDeleteSchema, request.body);
      const type = trashTypeSchema.parse(routeParam(request, "type"));
      const id = routeParam(request, "id");
      if (!isDeleted(repositories, type, id)) {
        throw new HttpError(404, "TRASH_ENTRY_NOT_FOUND", "Deleted entry was not found.");
      }
      hardDelete(repositories, type, id);
      response.status(204).end();
    },
  );
  return router;
}
