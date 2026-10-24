// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  propertyBreakdown: {
    popup: {
      agreement: {
        basePrice: [{ id: "base", name: "Base price (before GST)", amount: 280_000_000 }],
        otherCharges: [{ id: "parking", name: "Parking", amount: 0 }],
        gst: 20_000_000, preGstSubtotal: 300_000_000, grandTotal: 300_000_000,
        loan: 250_000_000, paidByYou: 50_000_000,
      },
      additional: {
        items: [{ id: "corpus", name: "Corpus fund", amount: 30_000_000 }, { id: "docs", name: "Documentation + deposit", amount: 10_000_000 }],
        subtotal: 40_000_000, totalBeforeCash: 340_000_000,
      },
      cash: { items: [{ id: "cash", name: "Cash component", amount: 10_000_000 }], subtotal: 10_000_000 },
      finalCost: 350_000_000,
      whoPays: [
        { id: "loan", name: "Loan", amount: 250_000_000, percent: 71.4 },
        { id: "self-paid-bank", name: "Self-paid (bank)", amount: 90_000_000, percent: 25.7 },
        { id: "cash", name: "Cash", amount: 10_000_000, percent: 2.9 },
      ],
      propertyFacts: { superBuiltUpSft: 1450, ratePerSft: 200_000, parkingSlots: 2 },
      checkDifferences: 2,
    },
  },
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

  it("opens a complete property breakdown in a focus-trapped dialog", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BeginnerLoanDashboard data={data} /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Show property cost breakdown" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Property cost breakdown" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Base price (before GST)")).toBeTruthy();
    expect(screen.getByText("Documentation + deposit")).toBeTruthy();
    expect(screen.getByText("Final cost of the flat")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Who pays" })).toBeTruthy();
    expect(screen.getByText(/2 differences · view in Loan details/)).toBeTruthy();
    expect(screen.getByText(/1,450 sft super built-up area/)).toBeTruthy();

    const close = screen.getByRole("button", { name: "Close property cost breakdown" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    const footerClose = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(footerClose);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Property cost breakdown" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog", { name: "Property cost breakdown" })).toBeNull();
  });
});
