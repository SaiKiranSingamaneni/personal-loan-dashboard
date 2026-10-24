import { asPaise, roundToPaise, type Paise } from "./money.js";

export type PropertyCostGroup = "AGREEMENT" | "ADDITIONAL" | "CASH";
export type PropertyCostKind = "BASE_PRICE" | "GST" | "PARKING" | "CLUB_HOUSE" | "OTHER_AGREEMENT" | "CORPUS_FUND" | "DOCUMENTATION_DEPOSIT" | "OTHER_ADDITIONAL" | "CASH_PAYMENT";
export interface PropertyCostComponent {
  id?: string;
  name: string;
  group: PropertyCostGroup;
  kind: PropertyCostKind;
  amount: Paise;
  note?: string | null;
}
export interface PropertyCostDetails {
  superBuiltUpSft: number;
  ratePerSft: Paise;
  parkingSlots: number;
  parkingCharges?: Paise | null;
  notedGrandTotal?: Paise | null;
  notedTotalBeforeCash?: Paise | null;
  notedFinalCost?: Paise | null;
}
export interface PropertyCostCheck {
  id: string;
  label: string;
  ok: boolean;
  expected: Paise;
  actual: Paise;
  difference: Paise;
}
export interface PropertyCostSummary {
  preGstSubtotal: Paise;
  gst: Paise;
  grandTotal: Paise;
  additionalCharges: Paise;
  totalBeforeCash: Paise;
  cashTotal: Paise;
  finalCost: Paise;
  loanShare: Paise;
  selfPaidBank: Paise;
  effectiveGstPreGstPercent: number;
  effectiveGstGrandTotalPercent: number;
  parkingPerSlot: Paise | null;
  checks: PropertyCostCheck[];
}
const CHECK_TOLERANCE = 100;

function sum(rows: readonly PropertyCostComponent[], predicate: (row: PropertyCostComponent) => boolean): Paise {
  return asPaise(rows.filter(predicate).reduce((total, row) => total + row.amount, 0));
}
function check(id: string, label: string, expected: Paise, actual: Paise): PropertyCostCheck {
  const difference = asPaise(actual - expected);
  return { id, label, ok: Math.abs(difference) <= CHECK_TOLERANCE, expected, actual, difference };
}

export function derivePropertyCost(input: {
  components: readonly PropertyCostComponent[];
  details: PropertyCostDetails;
  sanctionedLoan: Paise;
}): PropertyCostSummary {
  const { components, details, sanctionedLoan } = input;
  const preGstSubtotal = sum(components, (row) => row.group === "AGREEMENT" && row.kind !== "GST");
  const gst = sum(components, (row) => row.group === "AGREEMENT" && row.kind === "GST");
  const grandTotal = asPaise(preGstSubtotal + gst);
  const additionalCharges = sum(components, (row) => row.group === "ADDITIONAL");
  const totalBeforeCash = asPaise(grandTotal + additionalCharges);
  const cashTotal = sum(components, (row) => row.group === "CASH");
  const finalCost = asPaise(totalBeforeCash + cashTotal);
  const basePrice = sum(components, (row) => row.kind === "BASE_PRICE");
  const areaRateExpected = roundToPaise(details.superBuiltUpSft * details.ratePerSft);
  const checks: PropertyCostCheck[] = [
    check("area-rate", "Area × rate vs base price", areaRateExpected, basePrice),
    check("grand-total", "Pre-GST subtotal + GST vs grand total", grandTotal, asPaise(preGstSubtotal + gst)),
  ];
  if (details.notedTotalBeforeCash != null) checks.push(check("noted-before-cash", "Total before cash vs notes", details.notedTotalBeforeCash, totalBeforeCash));
  if (details.notedGrandTotal != null) checks.push(check("noted-grand-total", "Grand total vs notes", details.notedGrandTotal, grandTotal));
  if (details.notedFinalCost != null) checks.push(check("noted-final-cost", "Final cost vs notes", details.notedFinalCost, finalCost));
  const loanDifference = asPaise(sanctionedLoan - grandTotal);
  checks.push({
    id: "loan-grand-total", label: "Sanctioned loan does not exceed grand total",
    ok: loanDifference <= CHECK_TOLERANCE,
    expected: grandTotal, actual: sanctionedLoan, difference: loanDifference,
  });
  const parkingCharges = details.parkingCharges ?? sum(components, (row) => row.kind === "PARKING");
  return {
    preGstSubtotal, gst, grandTotal, additionalCharges, totalBeforeCash, cashTotal, finalCost,
    loanShare: sanctionedLoan,
    selfPaidBank: asPaise(Math.max(0, totalBeforeCash - sanctionedLoan)),
    effectiveGstPreGstPercent: preGstSubtotal === 0 ? 0 : gst / preGstSubtotal * 100,
    effectiveGstGrandTotalPercent: grandTotal === 0 ? 0 : gst / grandTotal * 100,
    parkingPerSlot: details.parkingSlots > 0 ? roundToPaise(parkingCharges / details.parkingSlots) : null,
    checks,
  };
}
