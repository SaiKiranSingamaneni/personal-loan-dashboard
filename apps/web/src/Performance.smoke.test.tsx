// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
  asPaise,
  asIsoDate,
  calculateEmi,
  createAmortizationSchedule,
  type Paise,
} from "@loan-dashboard/shared";
import { App, LoanRoute } from "./App.js";

interface PerformanceLoan {
  id: string;
  name: string;
  lender: string;
  loanType: "home";
  accountReference: null;
  status: "active";
  sanctionedAmount: number;
  annualRatePercent: number;
  rateType: "fixed";
  tenureMonths: number;
  startDate: string;
  emiDueDay: number;
  emiOverride: null;
  processingFee: null;
  otherCharges: null;
  propertyCost: number;
  emiStartRule: "full-disbursement";
  emiStartDate: null;
  archivedAt: null;
};

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function TestApplication() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={null} />
            <Route path="loans/:loanId" element={<LoanRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe("large dashboard render performance", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("renders a loan overview with five 600-payment loans in under one second", async () => {
    const loans: PerformanceLoan[] = Array.from({ length: 5 }, (_value, index) => ({
      id: `performance-loan-${index + 1}`,
      name: `Performance loan ${index + 1}`,
      lender: "Example Bank",
      loanType: "home",
      accountReference: null,
      status: "active",
      sanctionedAmount: 100_000_000,
      annualRatePercent: 8.5,
      rateType: "fixed",
      tenureMonths: 600,
      startDate: "1975-11-01",
      emiDueDay: 5,
      emiOverride: null,
      processingFee: null,
      otherCharges: null,
      propertyCost: 120_000_000,
      emiStartRule: "full-disbursement",
      emiStartDate: null,
      archivedAt: null,
    }));
    const dataById = new Map(loans.map((loan) => {
      const schedule = createAmortizationSchedule({
        principal: asPaise(loan.sanctionedAmount),
        annualRatePercent: loan.annualRatePercent,
        tenureMonths: loan.tenureMonths,
        firstDueDate: asIsoDate("1975-12-05"),
      });
      const payments = schedule.map((row) => ({
        id: `${loan.id}-payment-${row.period}`,
        loanId: loan.id,
        date: row.dueDate,
        amount: row.emi,
        type: "emi",
        principalPart: row.principal,
        interestPart: row.interest,
        status: "paid",
        scheduledPeriod: row.period,
        prepaymentMode: null,
        note: null,
        deletedAt: null,
      }));
      const summary = {
        propertyCost: loan.propertyCost,
        ownContribution: 0,
        loanUtilized: loan.sanctionedAmount,
        principalDisbursedAsOf: loan.sanctionedAmount,
        ownContributionPercent: 0,
        loanSharePercent: 83.33,
        propertyCostRemaining: 20_000_000,
        sanctionedNotDisbursed: 0,
        outstandingPrincipal: 40_000_000,
        principalRepaid: 60_000_000,
        interestPaidToDate: 0,
        emi: calculateEmi(asPaise(loan.sanctionedAmount), loan.annualRatePercent, loan.tenureMonths),
        totalInterest: schedule.reduce((total, row) => total + row.interest, 0) as Paise,
        totalPayable: schedule.reduce((total, row) => total + row.emi, 0) as Paise,
        interestAsPercentOfPrincipal: 40,
        nextDueDate: schedule[0]!.dueDate,
        nextDueAmount: schedule[0]!.emi,
        emisPaid: 600,
        emisRemaining: 0,
        projectedClosureDate: schedule.at(-1)!.dueDate,
        warnings: [],
      };
      return [loan.id, { loan, schedule, payments, summary }] as const;
    }));

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === "/api/loans") return response(loans);
      const match = /^\/api\/loans\/([^/]+)(?:\/(summary|schedule|payments|disbursements))?$/.exec(path);
      if (match?.[1] === undefined) return response([]);
      const data = dataById.get(match[1]);
      if (data === undefined) return response({ error: { code: "NOT_FOUND", message: "Missing loan" } });
      switch (match[2]) {
        case "summary": return response({ loan: data.loan, summary: data.summary });
        case "schedule": return response(data.schedule);
        case "payments": return response(data.payments);
        case "disbursements": return response([]);
        default: return response(data.loan);
      }
    }));
    window.history.replaceState({}, "", "/loans/performance-loan-1");

    const startedAt = performance.now();
    render(<TestApplication />);
    await screen.findByText("Monthly EMI");
    await screen.findByRole("img", { name: "Line chart comparing projected outstanding balance and actual outstanding balance" });
    await screen.findByRole("img", { name: "monthly stacked principal and interest chart" });
    await screen.findByRole("img", { name: "Area chart of cumulative interest paid" });
    await screen.findByRole("img", { name: "Monthly actual paid versus scheduled payments, with missed amounts highlighted" });
    await waitFor(() => expect(screen.queryByLabelText("Loading prepayment impact")).toBeNull());
    expect(performance.now() - startedAt).toBeLessThan(1000);
  }, 15_000);
});
