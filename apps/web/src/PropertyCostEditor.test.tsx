// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyCostEditor } from "./PropertyCostEditor.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fixtureProperty = {
  details: {
    unitLabel: "A-1204",
    superBuiltUpSft: 1250,
    carpetSft: 950,
    ratePerSft: 993_310,
    parkingSlots: 2,
    parkingCharges: 0,
    notedGrandTotal: 1_306_987_500,
    notedTotalBeforeCash: 1_345_848_300,
    notedFinalCost: 1_687_848_300,
  },
  components: [
    { id: "base", name: "Base price", group: "AGREEMENT", kind: "BASE_PRICE", amount: 1_241_638_125, note: null },
    { id: "gst", name: "GST", group: "AGREEMENT", kind: "GST", amount: 65_349_375, note: "As per demand letter" },
    { id: "corpus", name: "Corpus fund", group: "OUTSIDE_AGREEMENT", kind: "CORPUS_FUND", amount: 29_370_800, note: null },
    { id: "docs", name: "Documentation + deposit", group: "OUTSIDE_AGREEMENT", kind: "DOCUMENTATION_DEPOSIT", amount: 9_490_000, note: null },
    { id: "cash", name: "Cash component", group: "OUTSIDE_AGREEMENT", kind: "CASH_PAYMENT", amount: 342_000_000, note: "Separate cash payment" },
  ],
};

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><PropertyCostEditor loanId="loan-1" sanctionedLoan={900_000_000} /></QueryClientProvider>);
}

describe("property cost editor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the three-tier fixture totals and saves exact paise with notes", async () => {
    const user = userEvent.setup();
    let property: typeof fixtureProperty = structuredClone(fixtureProperty);
    const calls: { method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as typeof fixtureProperty;
        calls.push({ method, body: body as unknown as Record<string, unknown> });
        property = body;
      }
      return response(property);
    }));

    renderEditor();
    expect(await screen.findByRole("heading", { name: "Property and cost details" })).toBeTruthy();
    expect(screen.getByText("₹1,30,69,875.00")).toBeTruthy();
    expect(screen.getByText("₹1,34,58,483.00")).toBeTruthy();
    expect(screen.getByText("₹1,68,78,483.00")).toBeTruthy();
    expect(screen.getByText("GST is 5.26% of the pre-GST amount and 5.00% of the grand total.")).toBeTruthy();

    const gst = screen.getByLabelText(/GST amount \(₹\)/);
    await user.clear(gst);
    await user.type(gst, "6,53,493.75");
    expect((gst as HTMLInputElement).value).toBe("6,53,493.75");
    await user.click(screen.getByRole("button", { name: "Save property details" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const body = calls[0]!.body!;
    expect((body.components as { kind: string; amount: number; note: string | null }[]).find((row) => row.kind === "GST")).toMatchObject({ amount: 65_349_375, note: "As per demand letter" });
    expect((body.details as { notedFinalCost: number }).notedFinalCost).toBe(1_687_848_300);
  });

  it("offers repeatable custom charges and describes each input with helper text", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ details: null, components: [] })));
    renderEditor();
    await screen.findByRole("heading", { name: "Property and cost details" });

    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(10);
    for (const input of inputs) {
      const describedBy = input.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!.split(" ")[0]!)).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Add agreement charge" }));
    expect(screen.getAllByLabelText(/^Charge name/)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add additional charge" }));
    expect(screen.getAllByLabelText(/^Charge name/)).toHaveLength(2);
  });
});
