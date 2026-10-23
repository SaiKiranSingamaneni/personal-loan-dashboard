import { describe, expect, it } from "vitest";
import { buildCumulativeInterestSeries } from "./CumulativeInterestChart.js";

describe("cumulative paid interest series", () => {
  it("adds paid interest by month, carries flat months, and ignores scheduled rows", () => {
    const series = buildCumulativeInterestSeries([
      { date: "2026-03-05", interestPart: 5000, status: "paid" },
      { date: "2026-02-05", interestPart: 9000, status: "scheduled" },
      { date: "2026-01-05", interestPart: 10000, status: "paid" },
    ], "2026-04-20");
    expect(series).toEqual([
      { month: "2026-01", label: "Jan 2026", cumulativeInterest: 10000 },
      { month: "2026-02", label: "Feb 2026", cumulativeInterest: 10000 },
      { month: "2026-03", label: "Mar 2026", cumulativeInterest: 15000 },
      { month: "2026-04", label: "Apr 2026", cumulativeInterest: 15000 },
    ]);
  });

  it("returns no area series before interest is paid", () => {
    expect(buildCumulativeInterestSeries([
      { date: "2026-01-05", interestPart: 10000, status: "scheduled" },
      { date: "2026-02-05", interestPart: 5000, status: "missed" },
    ], "2026-03-01")).toEqual([]);
  });
});
