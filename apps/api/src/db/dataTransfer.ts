import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { exportDataSchema, type ExportData } from "@loan-dashboard/shared";
import { schema, loans, payments, disbursements, contributions, rateChanges, notes } from "./schema.js";

export const importRequestSchema = z.object({
  mode: z.enum(["preview", "overwrite"]),
  data: exportDataSchema,
}).strict();

function validateRelations(data: ExportData): void {
  const loanIds = new Set(data.loans.map((loan) => loan.id));
  for (const item of [
    ...data.disbursements,
    ...data.contributions,
    ...data.rateChanges,
    ...data.payments,
    ...data.notes,
  ]) {
    if (!loanIds.has(item.loanId)) {
      throw new Error(`Entry ${item.id} refers to a loan that is not in the import.`);
    }
  }
  const paymentById = new Map(data.payments.map((payment) => [payment.id, payment]));
  for (const note of data.notes) {
    if (note.paymentId !== null && paymentById.get(note.paymentId)?.loanId !== note.loanId) {
      throw new Error(`Note ${note.id} refers to a payment outside its loan.`);
    }
  }
}

export function exportAllData(database: Database.Database): ExportData {
  const db = drizzle(database, { schema });
  return exportDataSchema.parse({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    loans: db.select().from(loans).all(),
    disbursements: db.select().from(disbursements).all(),
    contributions: db.select().from(contributions).all(),
    rateChanges: db.select().from(rateChanges).all(),
    payments: db.select().from(payments).all(),
    notes: db.select().from(notes).all(),
  });
}

export function importAllData(
  database: Database.Database,
  value: unknown,
  mode: "preview" | "overwrite",
): { preview: boolean; counts: Record<string, number> } {
  const data = exportDataSchema.parse(value);
  validateRelations(data);
  const counts = {
    loans: data.loans.length,
    disbursements: data.disbursements.length,
    contributions: data.contributions.length,
    rateChanges: data.rateChanges.length,
    payments: data.payments.length,
    notes: data.notes.length,
  };
  if (mode === "preview") {
    return { preview: true, counts };
  }

  const db = drizzle(database, { schema });
  db.transaction((tx) => {
    tx.delete(notes).run();
    tx.delete(payments).run();
    tx.delete(rateChanges).run();
    tx.delete(contributions).run();
    tx.delete(disbursements).run();
    tx.delete(loans).run();
    if (data.loans.length > 0) tx.insert(loans).values(data.loans).run();
    if (data.disbursements.length > 0) tx.insert(disbursements).values(data.disbursements).run();
    if (data.contributions.length > 0) tx.insert(contributions).values(data.contributions).run();
    if (data.rateChanges.length > 0) tx.insert(rateChanges).values(data.rateChanges).run();
    if (data.payments.length > 0) tx.insert(payments).values(data.payments).run();
    if (data.notes.length > 0) tx.insert(notes).values(data.notes).run();
  });
  return { preview: false, counts };
}
