// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyCostEditor } from "./PropertyCostEditor.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("property cost editor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads grouped components, warns on invoice mismatch, and saves paise amounts", async () => {
    const user = userEvent.setup();
    let property: {
      components: { id: string; name: string; group: string; kind: string; amount: number; note: string | null }[];
      invoiceGrandTotal: number | null;
    } = {
      components: [
        { id: "cost-base", name: "Base price", group: "AGREEMENT", kind: "BASE_PRICE", amount: 1_000_000, note: null },
        { id: "cost-extra", name: "Interiors", group: "OUTSIDE_AGREEMENT", kind: "INTERIORS", amount: 200_000, note: "Later" },
      ],
      invoiceGrandTotal: 900_000,
    };
    const calls: { method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body)) as typeof property;
        calls.push({ method, body: body as unknown as Record<string, unknown> });
        property = body;
      }
      return response(property);
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><PropertyCostEditor loanId="loan-1" /></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Agreement value" })).toBeTruthy();
    expect(screen.getByText("Builder invoice differs from the agreement items by ₹1,000.00.")).toBeTruthy();
    const amounts = screen.getAllByLabelText("Amount in rupees");
    await user.clear(amounts[0]!);
    await user.type(amounts[0]!, "12000.00");
    await user.click(screen.getByRole("button", { name: "Save property costs" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const body = calls[0]!.body!;
    expect(body.invoiceGrandTotal).toBe(900_000);
    expect((body.components as { id?: string; amount: number }[])[0]).toMatchObject({ id: "cost-base", amount: 1_200_000 });
    expect(await screen.findByText("Property costs saved.")).toBeTruthy();
  });

  it("allows adding a custom cost item without defaulting GST", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response({ components: [], invoiceGrandTotal: null })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><PropertyCostEditor loanId="loan-2" /></QueryClientProvider>);
    await screen.findByRole("heading", { name: "Agreement value" });
    await user.click(screen.getAllByRole("button", { name: "+ Add cost item" })[0]!);
    const names = screen.getAllByLabelText("Cost item name");
    await user.type(names[0]!, "Local tax");
    expect(screen.getByLabelText("Grand total as per builder invoice (incl. GST)").getAttribute("placeholder")).toBe("Optional");
    expect(screen.getByRole("button", { name: "Save property costs" }).hasAttribute("disabled")).toBe(true);
  });
});