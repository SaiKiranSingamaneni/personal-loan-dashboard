// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DataManagementPage } from "./DataManagement.js";

const validExport = {
  formatVersion: 1,
  exportedAt: "2026-10-23T00:00:00.000Z",
  loans: [{
    id: "loan-1", name: "Home loan", lender: "Example Bank", loanType: "home", accountReference: null,
    status: "active", sanctionedAmount: 10_000_000, annualRatePercent: 8.5, rateType: "fixed",
    tenureMonths: 120, startDate: "2026-01-01", emiDueDay: 5, emiOverride: null, processingFee: null,
    otherCharges: null, propertyCost: null, emiStartRule: "full-disbursement", emiStartDate: null,
    archivedAt: null, deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  }],
  disbursements: [], contributions: [], rateChanges: [], payments: [], notes: [],
};

describe("data management page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("previews a validated export and only overwrites after explicit confirmation", async () => {
    const user = userEvent.setup();
    const requests: { mode?: string; path: string }[] = [];
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as { mode?: string };
      if (path === "/api/system/config") return new Response(JSON.stringify({ dbPath: "/workspace/db/data/loans.db", warnings: ["Database path warning"] }), { status: 200 });
      requests.push({ path, mode: body?.mode });
      if (path === "/api/import" && body?.mode === "preview") return new Response(JSON.stringify({ preview: true, counts: { loans: 1, payments: 0, notes: 0 } }), { status: 200 });
      if (path === "/api/import" && body?.mode === "overwrite") return new Response(JSON.stringify({ preview: false, counts: { loans: 1, payments: 0, notes: 0 } }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: "Unexpected request" } }), { status: 404 });
    }));
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><DataManagementPage /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByLabelText("Database path")).toHaveProperty("value", "/workspace/db/data/loans.db");
    expect(screen.getByRole("button", { name: "Copy path" })).toBeTruthy();
    expect(screen.getByText("Database path warning")).toBeTruthy();

    const file = new File([JSON.stringify(validExport)], "my-loans.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Import JSON file"), file);
    expect(await screen.findByText("Validated import preview")).toBeTruthy();
    expect(requests).toEqual([{ path: "/api/import", mode: "preview" }]);
    await user.click(screen.getByRole("button", { name: "Replace current data" }));
    await waitFor(() => expect(requests.some((request) => request.mode === "overwrite")).toBe(true));
    expect(await screen.findByText(/Imported 1 loans and 0 payments/)).toBeTruthy();
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });
});
