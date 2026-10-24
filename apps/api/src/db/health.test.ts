import Database from "better-sqlite3";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { checkDatabaseIntegrity, inspectDatabaseHealth } from "./health.js";

describe("database integrity health", () => {
  it("reports foreign-key corruption and puts API writes into read-only degraded mode", async () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (parent_id TEXT REFERENCES parent(id));");
    database.pragma("foreign_keys = OFF");
    database.prepare("INSERT INTO child (parent_id) VALUES ('missing')").run();

    const failures = checkDatabaseIntegrity(database);
    expect(failures).toEqual([expect.stringContaining("foreign_key_check found violations")]);
    const health = inspectDatabaseHealth(database, ":memory:", "/missing-backups");
    expect(health.dbOk).toBe(false);
    const app = createApp(undefined, undefined, database, health);
    const healthResponse = await request(app).get("/api/system/health");
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.dbOk).toBe(false);
    const writeResponse = await request(app).post("/api/loans").send({ name: "Blocked" });
    expect(writeResponse.status).toBe(503);
    expect(writeResponse.body.error.code).toBe("DB_DEGRADED");
    database.close();
  });
});
