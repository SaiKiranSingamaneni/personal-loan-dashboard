// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { aggregatePaymentHistory, PaymentHistoryChart } from "./PaymentHistoryChart.js";

const payments = [
  { date: "2026-01-05", amount: 50000, status: "paid" },
  { date: "2026-01-06", amount: 51000, status: "scheduled" },
  { date: "2026-01-07", amount: 52000, status: "missed" },
  { date: "2026-02-05", amount: 53000, status: "scheduled" },
] as const;

describe("payment history chart", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups paid, scheduled, and missed amounts independently by month", () => {
    expect(aggregatePaymentHistory(payments)).toEqual([
      { month: "2026-01", label: "Jan 2026", actualPaid: 50000, scheduled: 51000, missed: 52000 },
      { month: "2026-02", label: "Feb 2026", actualPaid: 0, scheduled: 53000, missed: 0 },
    ]);
  });

  it("labels the chart and provides a clear empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><PaymentHistoryChart loanId="loan-1" /></QueryClientProvider>);
    expect(await screen.findByText("Scheduled payments will appear here after they are generated.")).toBeTruthy();
  });
});
