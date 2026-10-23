// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BeginnerLoanDashboard } from "./BeginnerLoanDashboard.js";

const data = {
  loan: { id: "loan-1", name: "Home loan" },
  summary: {
    sanctioned: 900_000_000, disbursed: 250_000_000, undisbursed: 650_000_000,
    principalRepaid: 10_000_000, outstandingPrincipal: 240_000_000, interestPaid: 8_000_000,
    nextEmi: { date: "2026-11-05", amount: 8_000_000 }, totalOutlay: 350_000_000,
    agreementValue: 300_000_000, extraCosts: 50_000_000,
    fundingSplit: { loanDisbursed: 250_000_000, selfBank: 50_000_000, cash: 10_000_000, remainingToPay: 40_000_000 },
    warnings: [],
  },
  components: [
    { id: "base", name: "Base price", group: "AGREEMENT" as const, amount: 280_000_000 },
    { id: "gst", name: "GST", group: "AGREEMENT" as const, amount: 20_000_000 },
    { id: "interiors", name: "Interiors", group: "OUTSIDE_AGREEMENT" as const, amount: 50_000_000 },
  ],
  recentActivity: [{ id: "recent", title: "First payment", date: "2026-10-01", amount: 80_000_000, type: "EMI", notes: "Paid" }],
  invoiceMismatch: null,
};

describe("beginner loan dashboard", () => {
  afterEach(cleanup);

  it("explains loan totals, toggles property allocation, and opens the glossary", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BeginnerLoanDashboard data={data} /></MemoryRouter>);
    expect(screen.getByText(/You are buying a property that costs/)).toBeTruthy();
    expect(screen.getByText("Interest paid so far")).toBeTruthy();
    expect(screen.getAllByText("Rs 90.00 lakh").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rs 65.00 lakh").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Property cost" })).toBeTruthy();
    expect(screen.getByText("Base price")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "By who pays" }));
    expect(screen.getByText("Self (bank)")).toBeTruthy();
    expect(screen.getByText("Still to pay")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "What do these terms mean?" }));
    expect(screen.getByRole("dialog", { name: "Loan terms" })).toBeTruthy();
    expect(screen.getByText("Outstanding is the principal you still owe.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View all activity" }).getAttribute("href")).toBe("/?tab=activity");
  });
});