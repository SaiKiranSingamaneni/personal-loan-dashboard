import express, { type Express } from "express";
import { errorHandler, HttpError } from "./http/errors.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.use((_request, _response, next) => {
    next(new HttpError(404, "NOT_FOUND", "The requested endpoint does not exist."));
  });
  app.use(errorHandler);
  return app;
}
