// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BeginnerLoanDashboard } from "./BeginnerLoanDashboard.js";

const data = {
  loan: { id: "loan-1", name: "Home loan" },
  summary: {
    sanctioned: 250_000_000, disbursed: 250_000_000, undisbursed: 0,
    principalRepaid: 10_000_000, outstandingPrincipal: 240_000_000, interestPaid: 8_000_000,
    nextEmi: { date: "2026-11-05", amount: 8_000_000 }, totalOutlay: 350_000_000,
    agreementValue: 300_000_000, extraCosts: 50_000_000,
    fundingSplit: { loanDisbursed: 250_000_000, selfBank: 90_000_000, cash: 10_000_000, remainingToPay: 0 },
    warnings: [],
  },
  components: [
    { id: "base", name: "Base price", group: "AGREEMENT" as const, amount: 280_000_000 },
    { id: "gst", name: "GST", group: "AGREEMENT" as const, amount: 20_000_000 },
    { id: "interiors", name: "Corpus fund", group: "ADDITIONAL" as const, amount: 40_000_000 },
    { id: "cash", name: "Cash component", group: "CASH" as const, amount: 10_000_000 },
  ],
  recentActivity: [{ id: "recent", title: "First payment", date: "2026-10-01", amount: 80_000_000, type: "EMI", notes: "Paid" }],
  invoiceMismatch: null,
  propertyBreakdown: {
    details: { superBuiltUpSft: 1450, ratePerSft: 200_000, parkingSlots: 2 },
    popup: {
      costSlices: [
        { id: "base", name: "Base price", amount: 280_000_000, group: "AGREEMENT", kind: "BASE_PRICE", percent: 80 },
        { id: "gst", name: "GST", amount: 20_000_000, group: "AGREEMENT", kind: "GST", percent: 5.7 },
        { id: "corpus", name: "Corpus fund", amount: 40_000_000, group: "ADDITIONAL", kind: "CORPUS_FUND", percent: 11.4 },
        { id: "cash", name: "Cash component", amount: 10_000_000, group: "CASH", kind: "CASH_PAYMENT", percent: 2.9 },
      ],
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
      youPayTotal: 100_000_000,
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

  it("shows the three-way property summary and all three pies, then opens the glossary", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><BeginnerLoanDashboard data={data} /></MemoryRouter>);
    expect(screen.getByText(/The flat has a final cost/)).toBeTruthy();
    expect(screen.getByText(/self-paid through the bank/)).toBeTruthy();
    expect(screen.getByLabelText("Loan summary").textContent).toContain("and cash Rs 1.00 lakh");
    expect(screen.getByText("Total property cost")).toBeTruthy();
    const selfPaidKpi = screen.getByText("You pay yourself").closest("article");
    expect(selfPaidKpi?.textContent).toContain("Rs 10.00 lakh");
    expect(selfPaidKpi?.textContent).toContain("Of which cash: Rs 1.00 lakh");
    expect(screen.getByText("Loan covers")).toBeTruthy();
    expect(screen.getByText("Loan still owed")).toBeTruthy();
    expect(screen.getByText("Interest paid so far")).toBeTruthy();
    expect(screen.getByText("Next EMI")).toBeTruthy();
    expect(screen.getAllByText("Rs 25.00 lakh").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "What the flat costs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Who pays" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your loan" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "What the flat costs chart" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Who pays chart" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Your loan chart" })).toBeTruthy();
    expect(screen.getByText("Base price")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "By who pays" })).toBeNull();
    expect(screen.getByText(/three-way split is/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "What do these terms mean?" }));
    const glossary = screen.getByRole("dialog", { name: "Loan terms" });
    expect(glossary).toBeTruthy();
    expect(screen.getByText("Outstanding is the principal you still owe.")).toBeTruthy();
    const glossaryTerms = Array.from(glossary.querySelectorAll("dt")).map((term) => term.textContent);
    expect(glossaryTerms).toEqual(expect.arrayContaining(["Grand total", "GST", "Corpus fund", "Documentation + deposit", "Cash component", "Super built-up area"]));
    expect(screen.getByText("Usually the amount stated for the agreement, including GST; check your agreement.")).toBeTruthy();
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
    const breakdownLabels = Array.from(dialog.querySelectorAll(".breakdown-line > span"));
    expect(breakdownLabels.find((label) => label.textContent === "GST")?.getAttribute("title")).toContain("check the amount");
    expect(breakdownLabels.find((label) => label.textContent === "Grand total")?.getAttribute("title")).toContain("check your agreement");
    expect(screen.getByRole("table", { name: "Who pays" })).toBeTruthy();
    expect(screen.getByText(/2 differences · view in Loan details/)).toBeTruthy();
    expect(screen.getByText("super built-up area").getAttribute("title")).toContain("check the area definition");

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

  it("replaces property charts with one add-details card when property details are missing", () => {
    const noProperty = { ...data, propertyBreakdown: { ...data.propertyBreakdown, details: null } };
    render(<MemoryRouter><BeginnerLoanDashboard data={noProperty} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Property details are not set up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add property details" }).getAttribute("href")).toBe("/loans/loan-1/edit?tab=details");
    expect(screen.queryByRole("heading", { name: "What the flat costs" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Who pays" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Your loan" })).toBeTruthy();
  });

  it("uses server-provided cost and payer slices that each reconcile to the final cost", () => {
    const popup = data.propertyBreakdown.popup;
    expect(popup.costSlices.reduce((sum, item) => sum + item.amount, 0)).toBe(popup.finalCost);
    expect(popup.whoPays.reduce((sum, item) => sum + item.amount, 0)).toBe(popup.finalCost);
    expect(popup.costSlices.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100, 5);
    expect(popup.whoPays.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(100, 5);
  });
});
