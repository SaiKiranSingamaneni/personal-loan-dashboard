// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityTab } from "./ActivityTab.js";

const autoEmi = {
  id: "auto-emi-1", type: "EMI", date: "2026-03-05", dueDate: "2026-03-05", amount: 80_000,
  title: "March installment", notes: "Paid from salary", origin: "AUTO", userEdited: false,
  status: "PAID", interestPart: 20_000, principalPart: 60_000,
};
const entry = {
  ...autoEmi,
  id: "user-entry-1", type: "SELF_CONTRIBUTION", date: "2026-02-01", dueDate: null,
  amount: 100_000, title: "Booking contribution", notes: "Initial payment", origin: "USER",
  status: null, interestPart: null, principalPart: null, source: "BANK",
};

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Activity table", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends combined filters to the server, displays totals, and edits a row in the form", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    const updates: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/property")) return response({ components: [] });
      if (url.pathname.startsWith("/api/activity/") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        updates.push(body);
        return response({ ...autoEmi, ...body, userEdited: true });
      }
      if (url.pathname.endsWith("/activity")) return response({
        items: [autoEmi, entry], total: 2, page: Number(url.searchParams.get("page") ?? 1),
        pageSize: Number(url.searchParams.get("pageSize") ?? 10),
        totals: { selfContributions: 100_000, loanDisbursed: 0, emisPaid: 80_000, extraPayments: 0 },
      });
      return response({});
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ActivityTab loanId="loan-1" /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Activity history" })).toBeTruthy();
    expect(await screen.findByText("March installment")).toBeTruthy();
    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.getByText("Interest")).toBeTruthy();
    expect(screen.getAllByText("₹800.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit March installment" })).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "EMI" }));
    await user.selectOptions(screen.getByLabelText("Status"), "PAID");
    await user.type(screen.getByLabelText("Search"), "March");
    await waitFor(() => expect(requests.some((url) =>
      url.includes("type=EMI") && url.includes("status=PAID") && url.includes("q=March"),
    )).toBe(true));

    await user.click(screen.getByRole("button", { name: "Edit March installment" }));
    expect(await screen.findByRole("heading", { name: "Editing: March installment" })).toBeTruthy();
    expect(screen.getByLabelText("Entry type")).toHaveProperty("disabled", true);
    const title = screen.getByLabelText(/Title/);
    await user.clear(title);
    await user.type(title, "March corrected");
    await user.click(screen.getByRole("button", { name: "Update entry" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ type: "EMI", title: "March corrected", amount: 80_000 });
  });
});