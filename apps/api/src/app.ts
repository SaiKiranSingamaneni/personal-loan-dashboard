import express, { type Express } from "express";
import type { RepositorySet } from "./db/repositories.js";
import { errorHandler, HttpError } from "./http/errors.js";
import { createLoansRouter } from "./routes/loans.js";
import { createLoanEntryRouters } from "./routes/loanEntries.js";

export function createApp(repositories?: RepositorySet): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  if (repositories !== undefined) {
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
