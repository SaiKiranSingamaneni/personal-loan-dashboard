import { describe, expect, it } from "vitest";
import { buildBalanceSeries } from "./BalanceOverTimeChart.js";

describe("balance over time series", () => {
  it("compares projected closes with paid principal and leaves future actuals empty", () => {
    const series = buildBalanceSeries({
      sanctionedAmount: 1_000_000,
      startDate: "2026-01-01",
      today: "2026-02-15",
      disbursements: [{ date: "2026-01-10", amount: 600_000 }, { date: "2026-02-01", amount: 400_000 }],
      payments: [
        { date: "2026-02-05", amount: 100_000, principalPart: 90_000, interestPart: 10_000, status: "paid" },
        { date: "2026-03-05", amount: 100_000, principalPart: 91_000, interestPart: 9_000, status: "scheduled" },
      ],
      schedule: [
        { period: 1, dueDate: "2026-02-05", openingBalance: 1_000_000, emi: 100_000, principal: 90_000, interest: 10_000, closingBalance: 910_000 },
        { period: 2, dueDate: "2026-03-05", openingBalance: 910_000, emi: 100_000, principal: 91_000, interest: 9_000, closingBalance: 819_000 },
      ],
    });

    expect(series.find((point) => point.date === "2026-02-05")).toMatchObject({ projected: 910_000, actual: 910_000 });
    expect(series.find((point) => point.date === "2026-02-15")?.actual).toBe(910_000);
    expect(series.find((point) => point.date === "2026-03-05")).toMatchObject({ projected: 819_000, actual: null });
  });

  it("uses the sanctioned amount as the initial balance when no disbursement rows exist", () => {
    const series = buildBalanceSeries({
      sanctionedAmount: 500_000,
      startDate: "2026-01-01",
      today: "2026-01-01",
      disbursements: [],
      payments: [],
      schedule: [{ period: 1, dueDate: "2026-02-05", openingBalance: 500_000, emi: 50_000, principal: 40_000, interest: 10_000, closingBalance: 460_000 }],
    });
    expect(series.find((point) => point.date === "2026-01-01")?.actual).toBe(500_000);
  });
});
