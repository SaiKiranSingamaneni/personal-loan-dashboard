import { describe, expect, it } from "vitest";
import { emptyLoanFormValues, loanFormSchema } from "./loanFormSchema.js";

describe("loan form validation", () => {
  it("accepts valid loan and property funding values", () => {
    expect(
      loanFormSchema.safeParse({
        ...emptyLoanFormValues,
        name: "Apartment loan",
        lender: "Example Bank",
        sanctionedAmount: "5000000.00",
        propertyCost: "6500000",
        initialOwnContribution: "1250000",
        initialLoanUtilized: "5000000",
      }).success,
    ).toBe(true);
  });

  it("reports amount, date, due-day, and EMI start date errors inline", () => {
    const result = loanFormSchema.safeParse({
      ...emptyLoanFormValues,
      sanctionedAmount: "12.999",
      startDate: "2025-02-30",
      emiDueDay: "32",
      emiStartRule: "date",
      emiStartDate: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("sanctionedAmount");
      expect(paths).toContain("startDate");
      expect(paths).toContain("emiDueDay");
      expect(paths).toContain("emiStartDate");
    }
  });
});
