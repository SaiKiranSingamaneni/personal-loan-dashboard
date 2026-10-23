import express, { type Express } from "express";
import type { RepositorySet } from "./db/repositories.js";
import { errorHandler, HttpError } from "./http/errors.js";
import { createLoansRouter } from "./routes/loans.js";
import { createLoanEntryRouters } from "./routes/loanEntries.js";
import { createSimulationRouter } from "./routes/simulate.js";
import { BackupService } from "./db/backup.js";
import type Database from "better-sqlite3";
import { createDataSafetyRouter } from "./routes/dataSafety.js";

export function createApp(
  repositories?: RepositorySet,
  backupService?: BackupService,
  database?: Database.Database,
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.use("/api/simulate", createSimulationRouter());
  if (backupService !== undefined) {
    app.post("/api/backup", async (_request, response, next) => {
      try {
        const path = await backupService.create();
        response.status(201).json({ path });
      } catch (error) {
        next(error);
      }
    });
  }
  if (repositories !== undefined) {
    if (database !== undefined) {
      app.use("/api", createDataSafetyRouter(database, repositories));
    }
    const entries = createLoanEntryRouters(repositories, (id) => {
      if (repositories.loans.getById(id) === undefined) {
        throw new HttpError(404, "LOAN_NOT_FOUND", "Loan was not found.");
      }
    });
    app.use("/api/loans", entries.collections);
    app.use("/api/loans", createLoansRouter(repositories));
    app.use("/api/payments", entries.payments);
    app.use("/api/disbursements", entries.disbursements);
    app.use("/api/contributions", entries.contributions);
    app.use("/api/rate-changes", entries.rateChanges);
    app.use("/api/notes", entries.notes);
  }
  app.use((_request, _response, next) => {
    next(new HttpError(404, "NOT_FOUND", "The requested endpoint does not exist."));
  });
  app.use(errorHandler);
  return app;
}
