import { z } from "zod";
import { isoDateInputSchema } from "@loan-dashboard/shared";

const indianAmountPattern = /^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/;
const amountText = z.string().trim().refine(
  (value) => indianAmountPattern.test(value),
  "Enter a rupee amount with valid Indian grouping and up to two decimal places.",
);
const optionalAmountText = z.string().trim().refine(
  (value) => value === "" || indianAmountPattern.test(value),
  "Enter a rupee amount with valid Indian grouping and up to two decimal places.",
);

export const loanFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a loan name.").max(120),
    lender: z.string().trim().min(1, "Enter the lender name.").max(120),
    loanType: z.enum(["home", "plot", "vehicle", "personal", "other"]),
    accountReference: z.string().trim().max(120),
    status: z.enum(["active", "closed"]),
    sanctionedAmount: amountText,
    annualRatePercent: z.string().trim().regex(/^\d+(?:\.\d{1,4})?$/, "Enter a valid annual rate."),
    rateType: z.enum(["fixed", "floating"]),
    tenureMonths: z.string().trim().regex(/^\d+$/, "Enter tenure in whole months."),
    startDate: isoDateInputSchema,
    emiDueDay: z.string().trim().regex(/^\d{1,2}$/, "Enter a day from 1 to 31."),
    emiBasis: z.enum(["SANCTIONED", "DISBURSED"]),
    preEmiInterestOnly: z.boolean(),
    interestMethod: z.enum(["DAILY", "MONTHLY"]),
    emiOverride: optionalAmountText,
    processingFee: optionalAmountText,
    otherCharges: optionalAmountText,
    propertyCost: optionalAmountText,
    initialOwnContribution: optionalAmountText,
    initialLoanUtilized: optionalAmountText,
    emiStartRule: z.enum(["full-disbursement", "date"]),
    emiStartDate: z.string(),
  })
  .superRefine((values, context) => {
    if (Number(values.annualRatePercent) > 1000) {
      context.addIssue({ code: "custom", path: ["annualRatePercent"], message: "Rate must be 1000% or less." });
    }
    const tenure = Number(values.tenureMonths);
    if (!Number.isInteger(tenure) || tenure < 1 || tenure > 1200) {
      context.addIssue({ code: "custom", path: ["tenureMonths"], message: "Tenure must be from 1 to 1200 months." });
    }
    const dueDay = Number(values.emiDueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      context.addIssue({ code: "custom", path: ["emiDueDay"], message: "Due day must be from 1 to 31." });
    }
    if (values.emiStartRule === "date" && !isoDateInputSchema.safeParse(values.emiStartDate).success) {
      context.addIssue({ code: "custom", path: ["emiStartDate"], message: "Enter a valid EMI start date." });
    }
  });

export type LoanFormValues = z.infer<typeof loanFormSchema>;

const now = new Date();
const localToday = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now
  .getDate()
  .toString()
  .padStart(2, "0")}`;

export const emptyLoanFormValues: LoanFormValues = {
  name: "",
  lender: "",
  loanType: "home",
  accountReference: "",
  status: "active",
  sanctionedAmount: "",
  annualRatePercent: "8.5",
  rateType: "floating",
  tenureMonths: "240",
  startDate: localToday,
  emiDueDay: "5",
  emiBasis: "DISBURSED",
  preEmiInterestOnly: false,
  interestMethod: "DAILY",
  emiOverride: "",
  processingFee: "",
  otherCharges: "",
  propertyCost: "",
  initialOwnContribution: "",
  initialLoanUtilized: "",
  emiStartRule: "full-disbursement",
  emiStartDate: "",
};
