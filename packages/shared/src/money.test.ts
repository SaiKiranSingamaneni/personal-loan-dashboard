import { describe, expect, it } from "vitest";
import {
  asPaise,
  formatIndianMoney,
  formatIndianNumber,
  roundToPaise,
  rupeesToPaise,
} from "./money.js";

describe("money helpers", () => {
  it("parses rupees into integer paise exactly", () => {
    expect(rupeesToPaise("50,00,000.05")).toBe(500000005);
    expect(rupeesToPaise("-0.5")).toBe(-50);
    expect(rupeesToPaise("12")).toBe(1200);
  });

  it("rejects excess decimals and unsafe integer amounts", () => {
    expect(() => rupeesToPaise("1.001")).toThrow();
    expect(() => rupeesToPaise("90071992547410")).toThrow();
    expect(() => asPaise(1.5)).toThrow();
  });

  it("rounds calculated interest to the nearest paisa, halves up", () => {
    expect(roundToPaise(105.49)).toBe(105);
    expect(roundToPaise(105.5)).toBe(106);
  });

  it("formats values with Indian lakh and crore grouping", () => {
    expect(formatIndianMoney(asPaise(123456789))).toBe("₹12,34,567.89");
    expect(formatIndianNumber(12345678)).toBe("1,23,45,678");
    expect(formatIndianMoney(asPaise(100), "INR ")).toBe("INR 1.00");
  });
});
