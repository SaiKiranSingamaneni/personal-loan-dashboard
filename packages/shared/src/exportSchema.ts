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
  emiOverride: nonnegativeMoney.nullable(),
  processingFee: nonnegativeMoney.nullable(),
  otherCharges: nonnegativeMoney.nullable(),
  propertyCost: nonnegativeMoney.nullable(),
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

export const exportDataSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: timestamp,
  loans: z.array(loanDataSchema),
  disbursements: z.array(loanChildSchema),
  contributions: z.array(loanChildSchema),
  rateChanges: z.array(rateChangeDataSchema),
  payments: z.array(paymentDataSchema),
  notes: z.array(noteDataSchema),
}).strict();

export type ExportData = z.infer<typeof exportDataSchema>;
