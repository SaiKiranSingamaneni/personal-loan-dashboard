import { z } from "zod";
import { isoDateInputSchema } from "./schemas.js";

const requiredText = z.string().min(1);
const nullableText = z.string().nullable();
const money = z.number().int().safe();
const nonnegativeMoney = money.nonnegative();
const timestamp = z.string().min(1);

const loanDataSchema = z.object({
  id: requiredText,
  name: requiredText,
  lender: requiredText,
  loanType: z.enum(["home", "plot", "vehicle", "personal", "other"]),
  accountReference: nullableText,
  status: z.enum(["active", "closed"]),
  sanctionedAmount: money.positive(),
  annualRatePercent: z.number().finite().nonnegative(),
  rateType: z.enum(["fixed", "floating"]),
  tenureMonths: z.number().int().positive(),
  startDate: isoDateInputSchema,
  emiDueDay: z.number().int().min(1).max(31),
  emiBasis: z.enum(["SANCTIONED", "DISBURSED"]).default("DISBURSED"),
  preEmiInterestOnly: z.boolean().default(false),
  interestMethod: z.enum(["DAILY", "MONTHLY"]).default("DAILY"),
  emiOverride: nonnegativeMoney.nullable(),
  processingFee: nonnegativeMoney.nullable(),
  otherCharges: nonnegativeMoney.nullable(),
  propertyCost: nonnegativeMoney.nullable(),
  invoiceGrandTotal: nonnegativeMoney.nullable().optional(),
  emiStartRule: z.enum(["full-disbursement", "date"]),
  emiStartDate: isoDateInputSchema.nullable(),
  archivedAt: nullableText,
  deletedAt: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const loanChildSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  date: isoDateInputSchema,
  amount: nonnegativeMoney,
  note: nullableText,
  deletedAt: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const paymentDataSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  date: isoDateInputSchema,
  amount: nonnegativeMoney,
  type: z.enum(["emi", "prepayment", "part-payment", "fee", "other"]),
  principalPart: nonnegativeMoney,
  interestPart: nonnegativeMoney,
  status: z.enum(["scheduled", "paid", "missed"]),
  scheduledPeriod: z.number().int().positive().nullable(),
  prepaymentMode: z.enum(["reduce-tenure", "reduce-emi"]).nullable(),
  note: nullableText,
  deletedAt: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const rateChangeDataSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  effectiveDate: isoDateInputSchema,
  annualRatePercent: z.number().finite().nonnegative(),
  mode: z.enum(["keep-emi", "keep-tenure"]),
  deletedAt: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const noteDataSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  date: isoDateInputSchema,
  text: requiredText,
  paymentId: nullableText,
  deletedAt: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const propertyCostDataSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  name: requiredText,
  group: z.enum(["AGREEMENT", "ADDITIONAL", "CASH", "OUTSIDE_AGREEMENT"]),
  kind: requiredText,
  amount: nonnegativeMoney,
  note: nullableText,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const propertyDetailsDataSchema = z.object({
  loanId: requiredText,
  unitLabel: nullableText,
  superBuiltUpSft: z.number().nonnegative(),
  carpetSft: z.number().nonnegative().nullable(),
  ratePerSft: nonnegativeMoney,
  parkingSlots: z.number().int().nonnegative(),
  parkingCharges: nonnegativeMoney.nullable(),
  notedGrandTotal: nonnegativeMoney.nullable(),
  notedTotalBeforeCash: nonnegativeMoney.nullable(),
  notedFinalCost: nonnegativeMoney.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

const activityDataSchema = z.object({
  id: requiredText,
  loanId: requiredText,
  type: z.enum(["SELF_CONTRIBUTION", "LOAN_DISBURSEMENT", "EMI", "EXTRA_EMI", "RATE_CHANGE"]),
  date: isoDateInputSchema,
  amount: nonnegativeMoney.nullable(),
  title: z.string().min(1).max(80),
  notes: z.string().max(1000).nullable(),
  origin: z.enum(["USER", "AUTO"]),
  userEdited: z.boolean(),
  deletedAt: nullableText,
  source: z.enum(["BANK", "CASH", "OTHER"]).nullable(),
  componentId: nullableText,
  trancheLabel: nullableText,
  bankReference: nullableText,
  status: z.enum(["PAID", "MISSED", "SKIPPED"]).nullable(),
  dueDate: isoDateInputSchema.nullable(),
  mode: z.enum(["REDUCE_TENURE", "REDUCE_EMI"]).nullable(),
  newRatePercent: z.number().finite().nonnegative().nullable(),
  effectiveDate: isoDateInputSchema.nullable(),
  rateOption: z.enum(["KEEP_EMI_CHANGE_TENURE", "KEEP_TENURE_CHANGE_EMI"]).nullable(),
  interestPart: nonnegativeMoney.nullable(),
  principalPart: nonnegativeMoney.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

export const exportDataSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: timestamp,
  loans: z.array(loanDataSchema),
  propertyCostComponents: z.array(propertyCostDataSchema).default([]),
  propertyDetails: z.array(propertyDetailsDataSchema).default([]),
  activityEntries: z.array(activityDataSchema).default([]),
  disbursements: z.array(loanChildSchema),
  contributions: z.array(loanChildSchema),
  rateChanges: z.array(rateChangeDataSchema),
  payments: z.array(paymentDataSchema),
  notes: z.array(noteDataSchema),
}).strict();

export type ExportData = z.infer<typeof exportDataSchema>;
