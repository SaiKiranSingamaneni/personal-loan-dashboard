import { z } from "zod";
import { asIsoDate } from "./dates.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      asIsoDate(value);
      return true;
    } catch {
      return false;
    }
  }, "Date must be a valid YYYY-MM-DD calendar date");

const loanFieldsSchema = z.object({
    name: z.string().trim().min(1).max(120),
    lender: z.string().trim().min(1).max(120),
    loanType: z.enum(["home", "plot", "vehicle", "personal", "other"]),
    accountReference: z.string().trim().max(120).nullable().optional(),
    status: z.enum(["active", "closed"]).default("active"),
    sanctionedAmount: z.number().int().positive().safe(),
    annualRatePercent: z.number().finite().min(0).max(1000),
    rateType: z.enum(["fixed", "floating"]),
    tenureMonths: z.number().int().min(1).max(1200),
    startDate: isoDateSchema,
    emiDueDay: z.number().int().min(1).max(31),
    emiOverride: z.number().int().nonnegative().safe().nullable().optional(),
    processingFee: z.number().int().nonnegative().safe().nullable().optional(),
    otherCharges: z.number().int().nonnegative().safe().nullable().optional(),
    propertyCost: z.number().int().nonnegative().safe().nullable().optional(),
    emiStartRule: z.enum(["full-disbursement", "date"]).default("full-disbursement"),
    emiStartDate: isoDateSchema.nullable().optional(),
}).strict();

function validateEmiStartRule(
  loan: { emiStartRule?: "full-disbursement" | "date"; emiStartDate?: string | null },
  context: z.RefinementCtx,
): void {
    if (loan.emiStartRule === "date" && loan.emiStartDate == null) {
      context.addIssue({
        code: "custom",
        path: ["emiStartDate"],
        message: "An EMI start date is required when using the date rule.",
      });
    }
}

export const loanCreateSchema = loanFieldsSchema.superRefine(validateEmiStartRule);

export const loanUpdateSchema = loanFieldsSchema
  .partial()
  .strict()
  .superRefine(validateEmiStartRule);

const paymentFieldsSchema = z.object({
    date: isoDateSchema,
    amount: z.number().int().nonnegative().safe(),
    type: z.enum(["emi", "prepayment", "part-payment", "fee", "other"]),
    principalPart: z.number().int().nonnegative().safe(),
    interestPart: z.number().int().nonnegative().safe(),
    status: z.enum(["scheduled", "paid", "missed"]),
    scheduledPeriod: z.number().int().positive().nullable().optional(),
    prepaymentMode: z.enum(["reduce-tenure", "reduce-emi"]).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
}).strict();

export const paymentCreateSchema = paymentFieldsSchema.refine(
  (payment) =>
    payment.principalPart + payment.interestPart <= payment.amount &&
    ((payment.type !== "prepayment" && payment.type !== "part-payment") ||
      payment.prepaymentMode !== undefined),
  {
    path: ["amount"],
    message:
      "Payment splits cannot exceed the amount, and prepayments require a reduction mode.",
  },
);

export const paymentUpdateSchema = paymentFieldsSchema.partial().strict();

export const disbursementCreateSchema = z
  .object({
    date: isoDateSchema,
    amount: z.number().int().positive().safe(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const disbursementUpdateSchema = disbursementCreateSchema.partial().strict();

export const contributionCreateSchema = disbursementCreateSchema;
export const contributionUpdateSchema = disbursementUpdateSchema;

export const rateChangeCreateSchema = z
  .object({
    effectiveDate: isoDateSchema,
    annualRatePercent: z.number().finite().min(0).max(1000),
    mode: z.enum(["keep-emi", "keep-tenure"]),
  })
  .strict();
export const rateChangeUpdateSchema = rateChangeCreateSchema.partial().strict();

export const noteCreateSchema = z
  .object({
    date: isoDateSchema,
    text: z.string().trim().min(1).max(5000),
    paymentId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const noteUpdateSchema = noteCreateSchema.partial().strict();

export const isoDateInputSchema = isoDateSchema;

export type LoanCreateInput = z.infer<typeof loanCreateSchema>;
export type LoanUpdateInput = z.infer<typeof loanUpdateSchema>;
