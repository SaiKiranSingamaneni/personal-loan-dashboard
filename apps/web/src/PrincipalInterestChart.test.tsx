// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { aggregatePrincipalInterest, PrincipalInterestChart } from "./PrincipalInterestChart.js";

const schedule = [
  { dueDate: "2026-01-05", principal: 70000, interest: 30000 },
  { dueDate: "2026-01-05", principal: 71000, interest: 29000 },
  { dueDate: "2026-02-05", principal: 72000, interest: 28000 },
  { dueDate: "2027-01-05", principal: 80000, interest: 20000 },
];

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("principal and interest chart", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("aggregates both schedule components by month and year", () => {
    expect(aggregatePrincipalInterest(schedule, "monthly")).toEqual([
      { key: "2026-01", label: "Jan 2026", principal: 141000, interest: 59000 },
      { key: "2026-02", label: "Feb 2026", principal: 72000, interest: 28000 },
      { key: "2027-01", label: "Jan 2027", principal: 80000, interest: 20000 },
    ]);
    expect(aggregatePrincipalInterest(schedule, "yearly")).toEqual([
      { key: "2026", label: "2026", principal: 213000, interest: 87000 },
      { key: "2027", label: "2027", principal: 80000, interest: 20000 },
    ]);
  });

  it("switches between monthly and yearly periods", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response(schedule)));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><PrincipalInterestChart loanId="loan-1" /></QueryClientProvider>);
    expect(await screen.findByRole("img", { name: "monthly stacked principal and interest chart" })).toBeTruthy();
    const yearly = screen.getByRole("button", { name: "Yearly" });
    await user.click(yearly);
    expect(yearly.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: "yearly stacked principal and interest chart" })).toBeTruthy();
  });
});
