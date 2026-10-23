// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityEntryForm, type ActivityFormEntry } from "./ActivityEntryForm.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderForm(props: { editingEntry?: ActivityFormEntry | null; onEditComplete?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ActivityEntryForm loanId="loan-1" {...props} /></QueryClientProvider>);
}

describe("Activity entry form", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("submits an extra EMI without asking for a principal or interest split and clears on success", async () => {
    const user = userEvent.setup();
    const calls: { method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST" || method === "PUT") calls.push({ method, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return response(method === "GET" ? { components: [] } : { ...calls.at(-1)?.body, id: "new-entry", origin: "USER" });
    }));
    renderForm();

    await user.selectOptions(screen.getByLabelText("Entry type"), "EXTRA_EMI");
    expect(screen.getByLabelText("Amount (Rs)")).toBeTruthy();
    expect(screen.queryByLabelText(/principal part|interest part/i)).toBeNull();
    await user.type(screen.getByLabelText(/Title/), "Bonus payment");
    await user.type(screen.getByLabelText("Amount (Rs)"), "25000.00");
    await user.click(screen.getByRole("button", { name: "Add extra emi" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "POST", body: {
      type: "EXTRA_EMI", title: "Bonus payment", amount: 2_500_000, mode: "REDUCE_TENURE",
    } });
    expect((await screen.findByRole("status")).textContent).toContain("Activity entry added.");
    expect(screen.getByLabelText(/Title/)).toHaveProperty("value", "");
  });

  it("locks the edited type, supports cancel, and updates an auto EMI as user-edited", async () => {
    const user = userEvent.setup();
    const onEditComplete = vi.fn();
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") calls.push({ method: "PUT", body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return response({ ...calls.at(-1)?.body, id: "auto-1", type: "EMI", origin: "AUTO", userEdited: true });
    }));
    const entry: ActivityFormEntry = {
      id: "auto-1", type: "EMI", date: "2026-02-05", amount: 800_000,
      title: "February installment", notes: null, status: "PAID", dueDate: "2026-02-05", origin: "AUTO",
    };
    const view = renderForm({ editingEntry: entry, onEditComplete });
    expect(await screen.findByRole("heading", { name: "Editing: February installment" })).toBeTruthy();
    expect(screen.getByLabelText("Entry type")).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText(/Title/)).toHaveProperty("value", "");
    expect(onEditComplete).toHaveBeenCalledTimes(1);

    view.rerender(<QueryClientProvider client={new QueryClient()}><ActivityEntryForm loanId="loan-1" editingEntry={{ ...entry }} onEditComplete={onEditComplete} /></QueryClientProvider>);
    const title = await screen.findByLabelText(/Title/);
    await user.clear(title);
    await user.type(title, "Corrected installment");
    await user.click(screen.getByRole("button", { name: "Update entry" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ type: "EMI", title: "Corrected installment", dueDate: "2026-02-05", amount: 800_000 });
    expect(onEditComplete).toHaveBeenCalledTimes(2);
  });
});