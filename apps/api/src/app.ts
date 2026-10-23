import express, { type Express } from "express";
import type { RepositorySet } from "./db/repositories.js";
import { errorHandler, HttpError } from "./http/errors.js";
import { createLoansRouter } from "./routes/loans.js";

export function createApp(repositories?: RepositorySet): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  if (repositories !== undefined) {
    app.use("/api/loans", createLoansRouter(repositories));
  }
  app.use((_request, _response, next) => {
    next(new HttpError(404, "NOT_FOUND", "The requested endpoint does not exist."));
  });
  app.use(errorHandler);
  return app;
}
