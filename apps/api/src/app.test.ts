import request from "supertest";
import express from "express";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { parseInput } from "./http/validation.js";
import { validateBody } from "./http/validation.js";
import { errorHandler } from "./http/errors.js";
import { loanCreateSchema } from "@loan-dashboard/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteDatabase } from "./db/connection.js";

const app = createApp();

describe("Express API skeleton", () => {
  it("serves a local health endpoint", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports the absolute database location and path warnings", async () => {
    const directory = mkdtempSync(join(tmpdir(), "loan-dashboard-system-config-"));
    const connection = openSqliteDatabase(join(directory, "loans.db"));
    try {
      const response = await request(createApp(undefined, undefined, connection.client)).get("/api/system/config");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ dbPath: connection.databasePath, warnings: [] });
    } finally {
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("returns the common error envelope for missing routes and malformed JSON", async () => {
    const missing = await request(app).get("/api/not-found");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");

    const invalidJson = await request(app)
      .post("/api/loans")
      .set("Content-Type", "application/json")
      .send("{");
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.body.error.code).toBe("INVALID_JSON");
  });

  it("validates shared loan inputs and returns field-level Zod errors", () => {
    expect(() =>
      parseInput(loanCreateSchema, {
        name: "",
        lender: "Example Bank",
        loanType: "home",
        sanctionedAmount: 1000,
        annualRatePercent: 8,
        rateType: "fixed",
        tenureMonths: 12,
        startDate: "2025-02-29",
        emiDueDay: 5,
      }),
    ).toThrow();
  });

  it("maps shared Zod body failures into the standard field-error response", async () => {
    const validationApp = express();
    validationApp.use(express.json());
    validationApp.post("/test", validateBody(loanCreateSchema), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    validationApp.use(errorHandler);
    const response = await request(validationApp).post("/test").send({ name: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fields.name).toBeDefined();
  });
});
