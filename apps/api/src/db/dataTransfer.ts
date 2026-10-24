import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
import { exportDataSchema, type ExportData } from "@loan-dashboard/shared";
import {
  activityEntries,
  contributions,
  disbursements,
  loans,
  notes,
  payments,
  propertyCostComponents,
  propertyDetails,
  rateChanges,
  schema,
} from "./schema.js";

export const importRequestSchema = z.object({
  mode: z.enum(["preview", "overwrite"]),
  data: exportDataSchema,
  confirmation: z.literal("REPLACE ALL DATA").optional(),
}).strict();

function validateRelations(data: ExportData): void {
  const loanIds = new Set(data.loans.map((loan) => loan.id));
  for (const item of [
    ...data.disbursements,
    ...data.contributions,
    ...data.rateChanges,
    ...data.payments,
    ...data.notes,
    ...data.propertyCostComponents,
    ...data.activityEntries,
  ]) {
    if (!loanIds.has(item.loanId)) {
      throw new Error(`Entry ${item.id} refers to a loan that is not in the import.`);
    }
  }
  for (const item of data.propertyDetails) {
    if (!loanIds.has(item.loanId)) throw new Error(`Property details refer to a loan that is not in the import.`);
  }
  const componentIds = new Set(data.propertyCostComponents.map((item) => item.id));
  for (const item of data.activityEntries) {
    if (item.componentId !== null && !componentIds.has(item.componentId)) {
      throw new Error(`Activity ${item.id} refers to a cost component that is not in the import.`);
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
  const withoutVersion = <T extends { version: number }>(rows: T[]) => rows.map((row) => {
    const output: Record<string, unknown> = { ...row };
    delete output.version;
    return output;
  });
  return exportDataSchema.parse({
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    loans: withoutVersion(db.select().from(loans).all()),
    propertyCostComponents: withoutVersion(db.select().from(propertyCostComponents).all()),
    propertyDetails: withoutVersion(db.select().from(propertyDetails).all()),
    activityEntries: withoutVersion(db.select().from(activityEntries).all()),
    disbursements: withoutVersion(db.select().from(disbursements).all()),
    contributions: withoutVersion(db.select().from(contributions).all()),
    rateChanges: withoutVersion(db.select().from(rateChanges).all()),
    payments: withoutVersion(db.select().from(payments).all()),
    notes: withoutVersion(db.select().from(notes).all()),
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
    propertyCostComponents: data.propertyCostComponents.length,
    propertyDetails: data.propertyDetails.length,
    activityEntries: data.activityEntries.length,
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
    tx.delete(activityEntries).run();
    tx.delete(propertyDetails).run();
    tx.delete(propertyCostComponents).run();
    tx.delete(notes).run();
    tx.delete(payments).run();
    tx.delete(rateChanges).run();
    tx.delete(contributions).run();
    tx.delete(disbursements).run();
    tx.delete(loans).run();
    if (data.loans.length > 0) tx.insert(loans).values(data.loans).run();
    const normalizedPropertyComponents: (typeof propertyCostComponents.$inferInsert)[] = data.propertyCostComponents.map((item) => ({
      ...item,
      group: item.group === "OUTSIDE_AGREEMENT" ? (item.kind === "IN_HAND_CASH" ? "CASH" : "ADDITIONAL") : item.group,
      kind: (item.kind === "IN_HAND_CASH" ? "CASH_PAYMENT" : item.kind === "OTHER" ? (item.group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL") : item.kind) as NonNullable<(typeof propertyCostComponents.$inferInsert)["kind"]>,
    }));
    if (normalizedPropertyComponents.length > 0) tx.insert(propertyCostComponents).values(normalizedPropertyComponents).run();
    if (data.propertyDetails.length > 0) tx.insert(propertyDetails).values(data.propertyDetails).run();
    if (data.activityEntries.length > 0) tx.insert(activityEntries).values(data.activityEntries).run();
    if (data.disbursements.length > 0) tx.insert(disbursements).values(data.disbursements).run();
    if (data.contributions.length > 0) tx.insert(contributions).values(data.contributions).run();
    if (data.rateChanges.length > 0) tx.insert(rateChanges).values(data.rateChanges).run();
    if (data.payments.length > 0) tx.insert(payments).values(data.payments).run();
    if (data.notes.length > 0) tx.insert(notes).values(data.notes).run();
  }, { behavior: "immediate" });
  return { preview: false, counts };
}
