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

const initialFundingFieldsSchema = z.object({
  initialOwnContribution: z.number().int().nonnegative().safe().default(0),
  initialLoanUtilized: z.number().int().nonnegative().safe().default(0),
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

export const loanCreateSchema = loanFieldsSchema
  .extend(initialFundingFieldsSchema.shape)
  .strict()
  .superRefine(validateEmiStartRule);

export const loanUpdateSchema = loanFieldsSchema
  .partial()
  .strict()
  .superRefine(validateEmiStartRule);

export const loanEditSchema = loanFieldsSchema
  .partial()
  .extend({
    initialOwnContribution: z.number().int().nonnegative().safe().optional(),
    initialLoanUtilized: z.number().int().nonnegative().safe().optional(),
  })
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

export const timelineQuerySchema = z
  .object({
    type: z.enum(["payment", "disbursement", "contribution", "rate-change", "note"]).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    q: z.string().trim().max(100).optional(),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "Start date must be on or before end date.",
      });
    }
  });

const prepaymentModeSchema = z.enum(["reduce-tenure", "reduce-emi"]);
export const simulationScenarioSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prepayment"),
    amount: z.number().int().positive().safe(),
    date: isoDateSchema,
    mode: prepaymentModeSchema,
  }),
  z.object({
    type: z.literal("recurring-prepayment"),
    amount: z.number().int().positive().safe(),
    firstDate: isoDateSchema,
    intervalMonths: z.number().int().min(1).max(1200),
    count: z.number().int().min(1).max(1200),
    mode: prepaymentModeSchema,
  }),
  z.object({
    type: z.literal("rate-change"),
    changes: z.array(rateChangeCreateSchema).min(1),
  }),
]);

export const simulateRequestSchema = z
  .object({
    principal: z.number().int().positive().safe(),
    annualRatePercent: z.number().finite().min(0).max(1000),
    tenureMonths: z.number().int().min(1).max(1200),
    firstDueDate: isoDateSchema,
    scenario: simulationScenarioSchema,
  })
  .strict();

export const isoDateInputSchema = isoDateSchema;

export type LoanCreateInput = z.infer<typeof loanCreateSchema>;
export type LoanUpdateInput = z.infer<typeof loanUpdateSchema>;
export type LoanEditInput = z.infer<typeof loanEditSchema>;
export type SimulationScenarioInput = z.infer<typeof simulationScenarioSchema>;
