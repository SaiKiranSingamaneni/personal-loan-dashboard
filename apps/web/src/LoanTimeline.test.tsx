// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoanTimeline } from "./LoanTimeline.js";

const rows = [
  { id: "payment:paid", entryId: "paid", type: "payment", date: "2020-03-05", amount: 50000, detail: "EMI", status: "paid", upcoming: false, overdue: false },
  { id: "payment:overdue", entryId: "overdue", type: "payment", date: "2020-03-10", amount: 52000, detail: "Scheduled EMI", status: "scheduled", upcoming: false, overdue: true },
  { id: "note:future", entryId: "future", type: "note", date: "2099-03-12", amount: null, detail: "Call lender", upcoming: true, overdue: false },
] as const;

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("loan timeline", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups upcoming and monthly history, flags overdue payments, and sends filters to the API", async () => {
    const user = userEvent.setup();
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      requestedUrls.push(url.toString());
      let filteredRows = url.searchParams.get("type") === "note" ? rows.filter((item) => item.type === "note") : [...rows];
      const search = url.searchParams.get("q")?.toLowerCase();
      if (search) filteredRows = filteredRows.filter((item) => item.detail.toLowerCase().includes(search));
      return response(filteredRows);
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><LoanTimeline loanId="loan-1" /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Upcoming" })).toBeTruthy();
    expect(screen.getByText("Call lender")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("March 2020")).toBeTruthy();
    expect(screen.getByText("Paid ₹500.00")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Type"), "note");
    await user.type(screen.getByLabelText("Search"), "lender");
    await user.click(screen.getByRole("button", { name: "Sort oldest first" }));
    await waitFor(() => expect(requestedUrls.some((url) => url.includes("type=note") && url.includes("q=lender") && url.includes("order=asc"))).toBe(true));
    expect(await screen.findByText("Call lender")).toBeTruthy();
    expect(screen.queryByText("Scheduled EMI")).toBeNull();
  });
});
