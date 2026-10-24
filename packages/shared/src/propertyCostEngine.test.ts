import { describe, expect, it } from "vitest";
import { derivePropertyCost, type PropertyCostComponent } from "./propertyCostEngine.js";
import { asPaise } from "./money.js";

const fixture: PropertyCostComponent[] = [
  { name: "Base price", group: "AGREEMENT", kind: "BASE_PRICE", amount: asPaise(1_241_638_125) },
  { name: "GST", group: "AGREEMENT", kind: "GST", amount: asPaise(65_349_375) },
  { name: "Corpus fund", group: "ADDITIONAL", kind: "CORPUS_FUND", amount: asPaise(29_370_800) },
  { name: "Documentation + deposit", group: "ADDITIONAL", kind: "DOCUMENTATION_DEPOSIT", amount: asPaise(9_490_000) },
  { name: "Cash", group: "CASH", kind: "CASH_PAYMENT", amount: asPaise(342_000_000) },
];

describe("three-tier property cost derivation", () => {
  it("preserves paise and reconciles the published fixture and funding split", () => {
    const result = derivePropertyCost({
      components: fixture,
      details: {
        superBuiltUpSft: 1,
        ratePerSft: asPaise(1_241_638_125),
        parkingSlots: 0,
        notedGrandTotal: asPaise(1_306_987_500),
        notedTotalBeforeCash: asPaise(1_345_848_300),
        notedFinalCost: asPaise(1_687_848_300),
      },
      sanctionedLoan: asPaise(900_000_000),
    });
    expect(result).toMatchObject({
      preGstSubtotal: 1_241_638_125,
      gst: 65_349_375,
      grandTotal: 1_306_987_500,
      additionalCharges: 38_860_800,
      totalBeforeCash: 1_345_848_300,
      cashTotal: 342_000_000,
      finalCost: 1_687_848_300,
      loanShare: 900_000_000,
      selfPaidBank: 445_848_300,
      effectiveGstGrandTotalPercent: 5,
    });
    expect(result.effectiveGstPreGstPercent).toBeCloseTo(5.26315789, 6);
    expect(result.checks.every((item) => item.ok)).toBe(true);
    expect(result.loanShare + result.selfPaidBank + result.cashTotal).toBe(result.finalCost);
  });

  it("returns warnings and signed differences beyond the 100-paise tolerance", () => {
    const result = derivePropertyCost({
      components: fixture,
      details: {
        superBuiltUpSft: 2,
        ratePerSft: asPaise(1_241_638_125),
        parkingSlots: 2,
        parkingCharges: asPaise(350_000),
        notedGrandTotal: asPaise(1_300_000_000),
        notedTotalBeforeCash: asPaise(1_345_848_300),
        notedFinalCost: asPaise(1_687_848_400),
      },
      sanctionedLoan: asPaise(1_400_000_000),
    });
    expect(result.checks.find((item) => item.id === "area-rate")?.ok).toBe(false);
    expect(result.checks.find((item) => item.id === "loan-grand-total")?.ok).toBe(false);
    expect(result.checks.find((item) => item.id === "noted-grand-total")?.difference).toBe(6_987_500);
    expect(result.parkingPerSlot).toBe(175_000);
  });

  it("treats GST as a stored amount and never derives a tax rate", () => {
    const result = derivePropertyCost({
      components: fixture.map((item) => item.kind === "GST" ? { ...item, amount: asPaise(65_349_376) } : item),
      details: { superBuiltUpSft: 0, ratePerSft: asPaise(0), parkingSlots: 0 },
      sanctionedLoan: asPaise(900_000_000),
    });
    expect(result.gst).toBe(65_349_376);
    expect(result.grandTotal).toBe(1_306_987_501);
  });
});
