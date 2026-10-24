// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
  asIsoDate,
  asPaise,
  calculateEmi,
  createAmortizationSchedule,
} from "@loan-dashboard/shared";
import { App, LoanFormPage, LoanRoute } from "./App.js";

interface StoredLoan {
  id: string;
  name: string;
  lender: string;
  loanType: string;
  accountReference: string | null;
  status: "active" | "closed";
  sanctionedAmount: number;
  annualRatePercent: number;
  rateType: "fixed" | "floating";
  tenureMonths: number;
  startDate: string;
  emiDueDay: number;
  emiOverride: number | null;
  processingFee: number | null;
  otherCharges: number | null;
  propertyCost: number | null;
  emiStartRule: "full-disbursement" | "date";
  emiStartDate: string | null;
  archivedAt: string | null;
};

function makeSummary(loan: StoredLoan) {
  const schedule = createAmortizationSchedule({
    principal: asPaise(loan.sanctionedAmount),
    annualRatePercent: loan.annualRatePercent,
    tenureMonths: loan.tenureMonths,
    firstDueDate: asIsoDate("2026-11-05"),
  });
  return {
    propertyCost: loan.propertyCost,
    ownContribution: 0,
    loanUtilized: loan.sanctionedAmount,
    principalDisbursedAsOf: loan.sanctionedAmount,
    ownContributionPercent: 0,
    loanSharePercent: 100,
    propertyCostRemaining: loan.propertyCost === null ? null : loan.propertyCost - loan.sanctionedAmount,
    sanctionedNotDisbursed: 0,
    outstandingPrincipal: loan.sanctionedAmount,
    principalRepaid: 0,
    interestPaidToDate: 0,
    emi: calculateEmi(asPaise(loan.sanctionedAmount), loan.annualRatePercent, loan.tenureMonths),
    totalInterest: schedule.reduce((total, row) => total + row.interest, 0),
    totalPayable: schedule.reduce((total, row) => total + row.emi, 0),
    interestAsPercentOfPrincipal: 20,
    nextDueDate: "2026-11-05",
    nextDueAmount: schedule[0]!.emi,
    emisPaid: 0,
    emisRemaining: loan.tenureMonths,
    projectedClosureDate: schedule.at(-1)!.dueDate,
    warnings: [],
  };
}

function makeDashboard(loan: StoredLoan) {
  const cost = loan.propertyCost ?? 0;
  return {
    loan,
    summary: {
      sanctioned: loan.sanctionedAmount,
      disbursed: loan.sanctionedAmount,
      undisbursed: 0,
      principalRepaid: 0,
      outstandingPrincipal: loan.sanctionedAmount,
      interestPaid: 0,
      nextEmi: { date: "2026-11-05", amount: calculateEmi(asPaise(loan.sanctionedAmount), loan.annualRatePercent, loan.tenureMonths) },
      totalOutlay: cost,
      agreementValue: cost,
      extraCosts: 0,
      fundingSplit: { loanDisbursed: loan.sanctionedAmount, selfBank: 0, cash: 0, remainingToPay: Math.max(0, cost - loan.sanctionedAmount) },
      warnings: [],
    },
    components: cost === 0 ? [] : [{ id: "base", name: "Base price", group: "AGREEMENT", amount: cost }],
    recentActivity: [],
    invoiceMismatch: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function TestApplication() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={null} />
            <Route path="loans/new" element={<LoanFormPage />} />
            <Route path="loans/:loanId/edit" element={<LoanFormPage />} />
            <Route path="loans/:loanId" element={<LoanRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("main UI flow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("creates loans with the expected EMI, then switches URL and active tab without reload", async () => {
    const user = userEvent.setup();
    const loans: StoredLoan[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), window.location.origin);
        if (url.pathname === "/api/loans" && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Omit<StoredLoan, "id" | "archivedAt">;
          const loan: StoredLoan = {
            ...body,
            id: `loan-${loans.length + 1}`,
            archivedAt: null,
          };
          loans.push(loan);
          return jsonResponse(loan, 201);
        }
        if (url.pathname === "/api/loans") return jsonResponse(loans);
        const loanMatch = /^\/api\/loans\/([^/]+)$/.exec(url.pathname);
        if (loanMatch?.[1] !== undefined) {
          const loan = loans.find((item) => item.id === loanMatch[1]);
          return loan === undefined
            ? jsonResponse({ error: { code: "LOAN_NOT_FOUND", message: "Missing loan" } }, 404)
            : jsonResponse(loan);
        }
        const summaryMatch = /^\/api\/loans\/([^/]+)\/summary$/.exec(url.pathname);
        if (summaryMatch?.[1] !== undefined) {
          const loan = loans.find((item) => item.id === summaryMatch[1]);
          return loan === undefined
            ? jsonResponse({ error: { code: "LOAN_NOT_FOUND", message: "Missing loan" } }, 404)
            : jsonResponse({ loan, summary: makeSummary(loan) });
        }
        const dashboardMatch = /^\/api\/loans\/([^/]+)\/dashboard$/.exec(url.pathname);
        if (dashboardMatch?.[1] !== undefined) {
          const loan = loans.find((item) => item.id === dashboardMatch[1]);
          return loan === undefined
            ? jsonResponse({ error: { code: "LOAN_NOT_FOUND", message: "Missing loan" } }, 404)
            : jsonResponse(makeDashboard(loan));
        }
        if (/^\/api\/loans\/[^/]+\/activity$/.test(url.pathname)) {
          return jsonResponse({ items: [], total: 0, page: 1, pageSize: 10, totals: { selfContributions: 0, loanDisbursed: 0, emisPaid: 0, extraPayments: 0 } });
        }
        if (/^\/api\/loans\/[^/]+\/property$/.test(url.pathname)) return jsonResponse({ details: null, components: [] });
        return jsonResponse([]);
      }),
    );
    const beforeUnload = vi.fn();
    window.addEventListener("beforeunload", beforeUnload);
    render(<TestApplication />);

    await user.click(await screen.findByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("loan-theme")).toBe("dark");
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("loan-theme")).toBe("light");

    await user.click(await screen.findByRole("link", { name: /add your first loan/i }));
    await user.type(screen.getByLabelText(/loan name/i), "Apartment loan");
    await user.type(screen.getByLabelText(/^lender/i), "Example Bank");
    const sanctionedAmount = screen.getByLabelText(/sanctioned loan amount/i);
    await user.type(sanctionedAmount, "5000000");
    expect((sanctionedAmount as HTMLInputElement).value).toBe("50,00,000");
    expect(screen.getByText("fifty lakh rupees")).toBeTruthy();
    expect(screen.getByLabelText(/Is your EMI calculated on the sanctioned amount or on the disbursed amount/)).toBeTruthy();
    await user.clear(screen.getByLabelText(/interest rate/i));
    await user.type(screen.getByLabelText(/interest rate/i), "8.5");
    await user.clear(screen.getByLabelText(/tenure \(months\)/i));
    await user.type(screen.getByLabelText(/tenure \(months\)/i), "240");
    await user.type(screen.getByLabelText(/initial loan disbursement/i), "5000000");
    expect(screen.queryByLabelText(/Is your EMI calculated on the sanctioned amount or on the disbursed amount/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save loan" }));

    expect(await screen.findByText("Total property cost")).toBeTruthy();
    expect((await screen.findAllByText("Rs 43,391.16")).length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe("/loans/loan-1");
    expect(screen.getByRole("tab", { name: "Dashboard" }).getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("tab", { name: "Analysis" }));
    expect(await screen.findByRole("heading", { name: "Amortization schedule" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Loan details" }));
    expect(await screen.findByRole("heading", { name: "Property and cost details" })).toBeTruthy();
    expect(window.location.pathname).toBe("/loans/loan-1/edit");
    expect(screen.queryByLabelText(/Total own contribution/)).toBeNull();
    expect(screen.queryByLabelText(/Total loan utilized/)).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(await screen.findByText("Total property cost")).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Add loan" }));
    await user.type(screen.getByLabelText(/loan name/i), "Personal loan");
    await user.type(screen.getByLabelText(/^lender/i), "Example Credit");
    await user.type(screen.getByLabelText(/sanctioned loan amount/i), "1000000");
    await user.clear(screen.getByLabelText(/interest rate/i));
    await user.type(screen.getByLabelText(/interest rate/i), "10");
    await user.clear(screen.getByLabelText(/tenure \(months\)/i));
    await user.type(screen.getByLabelText(/tenure \(months\)/i), "120");
    await user.type(screen.getByLabelText(/initial loan disbursement/i), "1000000");
    await user.click(screen.getByRole("button", { name: "Save loan" }));
    expect(await screen.findByRole("heading", { name: "Personal loan" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Activity" }));
    await user.click(screen.getByRole("link", { name: /Apartment loan/ }));
    expect((await screen.findByRole("tab", { name: "Activity" })).getAttribute("aria-selected")).toBe("true");
    expect(window.location.pathname).toBe("/loans/loan-1");
    expect(window.location.search).toBe("?tab=activity");
    expect(beforeUnload).not.toHaveBeenCalled();
    window.removeEventListener("beforeunload", beforeUnload);
  });
});
