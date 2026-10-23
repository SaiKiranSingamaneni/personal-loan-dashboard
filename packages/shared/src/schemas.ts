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

export const isoDateInputSchema = isoDateSchema;

export type LoanCreateInput = z.infer<typeof loanCreateSchema>;
export type LoanUpdateInput = z.infer<typeof loanUpdateSchema>;
