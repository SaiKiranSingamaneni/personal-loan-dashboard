import { describe, expect, it } from "vitest";
import { amountInWords, formatIndianMoneyInput, isValidIndianMoneyInput } from "./inputFormatting.js";

describe("loan and property input formatting", () => {
  it("groups rupees in Indian lakh and crore style while preserving paise", () => {
    expect(formatIndianMoneyInput("13069875.25")).toBe("1,30,69,875.25");
    expect(formatIndianMoneyInput("1,30,69,875.25")).toBe("1,30,69,875.25");
  });

  it("accepts Indian grouping and up to two decimals, and rejects malformed amounts", () => {
    expect(isValidIndianMoneyInput("1,30,69,875.25")).toBe(true);
    expect(isValidIndianMoneyInput("653493.75")).toBe(true);
    expect(isValidIndianMoneyInput("1,306,987.75")).toBe(false);
    expect(isValidIndianMoneyInput("1,30,69,875.255")).toBe(false);
  });

  it("reads large money amounts in Indian place values", () => {
    expect(amountInWords("1,30,69,875.25")).toBe("one crore thirty lakh sixty nine thousand eight hundred seventy five rupees");
    expect(amountInWords("999.00")).toBe("");
  });
});
