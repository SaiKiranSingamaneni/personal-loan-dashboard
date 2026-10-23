import { describe, expect, it } from "vitest";
import { addMonths, asIsoDate, compareIsoDates } from "./dates.js";

describe("date helpers", () => {
  it("validates calendar dates in the ISO date-only form", () => {
    expect(asIsoDate("2024-02-29")).toBe("2024-02-29");
    expect(() => asIsoDate("2023-02-29")).toThrow();
    expect(() => asIsoDate("2024-2-09")).toThrow();
  });

  it("adds months with day clamping, including across years", () => {
    expect(addMonths(asIsoDate("2024-01-31"), 1)).toBe("2024-02-29");
    expect(addMonths(asIsoDate("2024-01-31"), 2)).toBe("2024-03-31");
    expect(addMonths(asIsoDate("2024-03-31"), -1)).toBe("2024-02-29");
  });

  it("compares ISO dates chronologically", () => {
    expect(compareIsoDates(asIsoDate("2024-01-01"), asIsoDate("2024-02-01"))).toBe(-1);
    expect(compareIsoDates(asIsoDate("2024-02-01"), asIsoDate("2024-02-01"))).toBe(0);
  });
});
