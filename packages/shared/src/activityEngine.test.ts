import { describe, expect, it } from "vitest";
import { asIsoDate } from "./dates.js";
import { asPaise } from "./money.js";
import {
  reconcileAutoEmis,
  summarizeActivityDashboard,
  type ActivityRecord,
  type AutoEmiInput,
} from "./activityEngine.js";

const basicEmiInput: AutoEmiInput = {
  loanId: "loan-1",
  emiStartDate: asIsoDate("2026-01-05"),
  today: asIsoDate("2026-03-05"),
  sanctionedAmount: asPaise(9_000_000),
  annualRatePercent: 12,
  tenureMonths: 12,
  emiBasis: "DISBURSED",
  interestMethod: "MONTHLY",
  disbursements: [{ date: asIsoDate("2025-12-01"), amount: asPaise(3_000_000) }],
  entries: [],
};

describe("activity engine", () => {
  it("generates paid EMIs only through today and is idempotent", () => {
    const first = reconcileAutoEmis(basicEmiInput);
    const second = reconcileAutoEmis({ ...basicEmiInput, entries: first });
    const generated = first.filter((entry) => entry.origin === "AUTO");
    expect(generated).toHaveLength(3);
    expect(generated.every((entry) => entry.status === "PAID" && entry.amount! > 0)).toBe(true);
    expect(second).toEqual(first);
    expect(generated.map((entry) => entry.dueDate)).toEqual([
      "2026-01-05", "2026-02-05", "2026-03-05",
    ]);
  });

  it("preserves edited automatic rows and deleted-date tombstones", () => {
    const edited: ActivityRecord = {
      id: "custom-id", loanId: "loan-1", type: "EMI", date: asIsoDate("2026-01-05"),
      dueDate: asIsoDate("2026-01-05"), amount: asPaise(1234), title: "Corrected",
      origin: "AUTO", userEdited: true, status: "PAID",
    };
    const tombstone: ActivityRecord = {
      id: "deleted-id", loanId: "loan-1", type: "EMI", date: asIsoDate("2026-02-05"),
      dueDate: asIsoDate("2026-02-05"), amount: asPaise(1000), title: "Deleted",
      origin: "AUTO", userEdited: false, status: "PAID", deletedAt: "2026-02-06T00:00:00Z",
    };
    const result = reconcileAutoEmis({ ...basicEmiInput, entries: [edited, tombstone] });
    expect(result.find((entry) => entry.id === "custom-id")?.amount).toBe(1234);
    expect(result.find((entry) => entry.id === "deleted-id")?.deletedAt).toBeTruthy();
    expect(result.filter((entry) => entry.dueDate === "2026-02-05" && entry.deletedAt == null)).toHaveLength(0);
    expect(result.some((entry) => entry.dueDate === "2026-03-05" && entry.deletedAt == null)).toBe(true);
  });

  it("recomputes unedited rows when a later disbursement is added", () => {
    const original = reconcileAutoEmis({
      ...basicEmiInput,
      today: asIsoDate("2026-01-05"),
    });
    const changed = reconcileAutoEmis({
      ...basicEmiInput,
      today: asIsoDate("2026-01-05"),
      disbursements: [
        ...basicEmiInput.disbursements,
        { date: asIsoDate("2025-12-15"), amount: asPaise(1_000_000) },
      ],
      entries: original,
    });
    expect(changed.find((entry) => entry.origin === "AUTO")?.amount)
      .toBeGreaterThan(original.find((entry) => entry.origin === "AUTO")!.amount!);
  });

  it("summarizes outlay, funding, repayments, interest, and warnings", () => {
    const summary = summarizeActivityDashboard({
      sanctionedAmount: asPaise(3_000_000),
      emiStartDate: asIsoDate("2026-01-05"),
      annualRatePercent: 12,
      tenureMonths: 12,
      emiBasis: "DISBURSED",
      interestMethod: "MONTHLY",
      asOf: asIsoDate("2026-03-01"),
      disbursements: [{ date: asIsoDate("2026-01-01"), amount: asPaise(2_500_000) }],
      components: [
        { id: "base", name: "Base price", group: "AGREEMENT", kind: "BASE_PRICE", amount: asPaise(3_000_000) },
        { id: "interiors", name: "Interiors", group: "ADDITIONAL", kind: "OTHER_ADDITIONAL", amount: asPaise(500_000) },
      ],
      propertyDetails: { superBuiltUpSft: 1, ratePerSft: asPaise(3_000_000), parkingSlots: 0 },
      entries: [
        {
          id: "bank", loanId: "loan-1", type: "SELF_CONTRIBUTION", date: asIsoDate("2026-01-02"),
          amount: asPaise(500_000), title: "Bank contribution", origin: "USER", userEdited: true, source: "BANK",
        },
        {
          id: "cash", loanId: "loan-1", type: "SELF_CONTRIBUTION", date: asIsoDate("2026-01-03"),
          amount: asPaise(100_000), title: "Cash contribution", origin: "USER", userEdited: true, source: "CASH",
          componentId: "base",
        },
        {
          id: "emi", loanId: "loan-1", type: "EMI", date: asIsoDate("2026-02-05"),
          amount: asPaise(100_000), title: "EMI", origin: "AUTO", userEdited: false, status: "PAID",
          principalPart: asPaise(80_000), interestPart: asPaise(20_000),
        },
      ],
    });
    expect(summary).toMatchObject({
      sanctioned: 3_000_000,
      disbursed: 2_500_000,
      undisbursed: 500_000,
      principalRepaid: 80_000,
      outstandingPrincipal: 2_420_000,
      interestPaid: 20_000,
      agreementValue: 3_000_000,
      extraCosts: 500_000,
      totalOutlay: 3_500_000,
      paidSoFar: 3_100_000,
      remainingToPay: 400_000,
      nextEmi: { date: "2026-03-05", amount: expect.any(Number) },
      fundingSplit: { loanDisbursed: 2_500_000, selfBank: 500_000, cash: 100_000, remainingToPay: 400_000 },
      warnings: [],
    });
  });
});
