// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EmiCalculatorPage } from "./EmiCalculator.js";
import { WhatIfSimulator } from "./WhatIfSimulator.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("planning tools", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calculates the known EMI and total interest in the standalone calculator", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><EmiCalculatorPage /></QueryClientProvider></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Calculate EMI" }));
    expect(await screen.findByText("₹43,391.16")).toBeTruthy();
    expect(screen.getByText("₹54,13,879.44")).toBeTruthy();
  });

  it("does not apply a what-if plan until the user explicitly clicks Apply", async () => {
    const user = userEvent.setup();
    const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ path, method, ...(body === undefined ? {} : { body }) });
      if (path === "/api/loans/loan-1") return response({ annualRatePercent: 8.5 });
      if (path === "/api/loans/loan-1/summary") return response({ summary: { outstandingPrincipal: 5_000_000, emisRemaining: 60, nextDueDate: "2026-11-05" } });
      if (path === "/api/simulate") return response({
        schedule: [], baseInterest: 1_000_000, projectedInterest: 800_000, interestSaved: 200_000,
        monthsSaved: 4, baseClosureDate: "2031-10-05", projectedClosureDate: "2031-06-05", baseEmi: 100_000, projectedEmi: 100_000,
      });
      if (path === "/api/loans/loan-1/apply-simulation") return response({ applied: 1 }, 201);
      return response({ error: { message: "Unexpected request" } }, 404);
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><WhatIfSimulator loanId="loan-1" /></QueryClientProvider>);

    await user.type(await screen.findByLabelText("Prepayment amount (₹)"), "10000");
    await user.click(screen.getByRole("button", { name: "Calculate impact" }));
    expect(await screen.findByText("₹2,000.00")).toBeTruthy();
    expect(requests.some((request) => request.path === "/api/loans/loan-1/apply-simulation")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Apply this plan" }));
    await waitFor(() => expect(requests.some((request) => request.path === "/api/loans/loan-1/apply-simulation" && request.method === "POST")).toBe(true));
    expect(await screen.findByText("Scenario applied to the loan.")).toBeTruthy();
    expect(requests.find((request) => request.path === "/api/loans/loan-1/apply-simulation")?.body?.type).toBe("prepayment");
  });
});
