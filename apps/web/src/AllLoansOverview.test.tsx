// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AllLoansOverview } from "./AllLoansOverview.js";

const loans = [
  { id: "loan-1", name: "Loan Alpha", lender: "Bank A", loanType: "home", status: "active", archivedAt: null },
  { id: "loan-2", name: "Loan Beta", lender: "Bank B", loanType: "personal", status: "active", archivedAt: null },
];
const summaries = {
  "loan-1": { outstandingPrincipal: 10_000_000, emi: 100_000, totalInterest: 5_000_000, nextDueDate: "2026-11-05", nextDueAmount: 100_000 },
  "loan-2": { outstandingPrincipal: 20_000_000, emi: 200_000, totalInterest: 10_000_000, nextDueDate: "2026-10-29", nextDueAmount: 200_000 },
};

describe("all-loans overview", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sums loans and shows each next due in date order", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/loans") return new Response(JSON.stringify(loans), { status: 200 });
      const id = path.split("/")[3];
      const loan = loans.find((item) => item.id === id)!;
      return new Response(JSON.stringify({ loan, summary: summaries[id as keyof typeof summaries] }), { status: 200 });
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><AllLoansOverview /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByText("Total outstanding")).toBeTruthy();
    expect(screen.getByText("₹3,00,000.00")).toBeTruthy();
    expect(screen.getByText("₹3,000.00")).toBeTruthy();
    expect(screen.getByText("₹1,50,000.00")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Bar chart comparing outstanding balance for each loan" })).toBeTruthy();
    const loanNames = [...document.querySelectorAll(".upcoming-due-copy strong")].map((item) => item.textContent);
    expect(loanNames).toEqual(["Loan Beta", "Loan Alpha"]);
  });
});
