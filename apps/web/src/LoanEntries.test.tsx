// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoanEntries, paymentEntriesCsv } from "./LoanEntries.js";

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("loan entry forms", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("exports payment amounts as readable INR values", () => {
    expect(paymentEntriesCsv([{
      date: "2026-10-05", amount: 100000, type: "emi", principalPart: 70000,
      interestPart: 30000, status: "paid", note: "October, paid",
    }]).split("\r\n")).toEqual([
      "Date,Type,Amount (INR),Principal (INR),Interest (INR),Status,Note",
      '2026-10-05,emi,1000.00,700.00,300.00,paid,"October, paid"',
    ]);
  });

  it("adds, edits, and soft-deletes notes through the loan entry API", async () => {
    const user = userEvent.setup();
    const notes: Record<string, unknown>[] = [];
    const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ path, method, ...(body === undefined ? {} : { body }) });
      if (path === "/api/loans/loan-1/notes" && method === "POST") {
        const note = { ...body, id: "note-1", loanId: "loan-1", paymentId: null, deletedAt: null };
        notes.push(note);
        return response(note, 201);
      }
      if (path === "/api/notes/note-1" && method === "PUT") {
        Object.assign(notes[0]!, body);
        return response(notes[0]);
      }
      if (path === "/api/notes/note-1" && method === "DELETE") {
        notes.splice(0);
        return response(undefined, 204);
      }
      if (path === "/api/loans/loan-1/notes") return response(notes);
      if (path.startsWith("/api/loans/loan-1/")) return response([]);
      return response({ error: { message: "Unexpected request" } }, 404);
    }));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><LoanEntries loanId="loan-1" /></QueryClientProvider>);

    await user.selectOptions(screen.getByLabelText("Entry type"), "note");
    await user.type(screen.getByLabelText("Note text"), "Called bank about rate reset");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Called bank about rate reset")).toBeTruthy();
    expect(calls.some((call) => call.path === "/api/loans/loan-1/notes" && call.method === "POST")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const noteField = screen.getByLabelText("Note text");
    await user.clear(noteField);
    await user.type(noteField, "Bank confirmed the revised rate");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((call) => call.path === "/api/notes/note-1" && call.method === "PUT")).toBe(true));
    expect(await screen.findByText("Bank confirmed the revised rate")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((call) => call.path === "/api/notes/note-1" && call.method === "DELETE")).toBe(true));
    expect(await screen.findByText("No entries recorded yet.")).toBeTruthy();
  });

  it("offers the required fields for payments and each funding or rate entry", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => response([])));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><LoanEntries loanId="loan-1" /></QueryClientProvider>);

    expect(await screen.findByLabelText("Payment type")).toBeTruthy();
    expect(screen.getByLabelText("Principal part (₹)")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Entry type"), "disbursement");
    expect(screen.getByLabelText("Amount (₹)")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Entry type"), "contribution");
    expect(screen.getByLabelText("Amount (₹)")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Entry type"), "rate-change");
    expect(screen.getByLabelText("New annual rate (%)")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Entry type"), "note");
    expect(screen.getByLabelText("Note text")).toBeTruthy();
    expect(screen.getByLabelText("Linked payment (optional)")).toBeTruthy();
  });

  it("generates scheduled payments and opens a paid entry for adjustment", async () => {
    const user = userEvent.setup();
    const payment = {
      id: "payment-1", loanId: "loan-1", date: "2099-01-05", amount: 10000,
      type: "emi", principalPart: 8000, interestPart: 2000, status: "scheduled",
      scheduledPeriod: 1, prepaymentMode: null, note: null, deletedAt: null,
    };
    const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ path, method, ...(body === undefined ? {} : { body }) });
      if (path.endsWith("/payments/generate-scheduled")) return response({ created: 1, updated: 0, total: 1 });
      if (path === "/api/loans/loan-1/payments") return response([payment]);
      if (path === "/api/payments/payment-1" && method === "PUT") {
        Object.assign(payment, body);
        return response(payment);
      }
      if (path.startsWith("/api/loans/loan-1/")) return response([]);
      return response({ error: { message: "Unexpected request" } }, 404);
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><LoanEntries loanId="loan-1" /></QueryClientProvider>);

    expect(await screen.findByText("emi · scheduled")).toBeTruthy();
    expect(requests.some((call) => call.path === "/api/loans/loan-1/payments/generate-scheduled" && call.method === "POST")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Mark paid" }));
    expect(screen.getByLabelText("Status")).toHaveProperty("value", "paid");
    expect(screen.getByLabelText("Date")).toHaveProperty("value", new Date().toISOString().slice(0, 10));
    await user.clear(screen.getByLabelText("Amount (₹)"));
    await user.type(screen.getByLabelText("Amount (₹)"), "120.00");
    await user.clear(screen.getByLabelText("Principal part (₹)"));
    await user.type(screen.getByLabelText("Principal part (₹)"), "100.00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(requests.some((call) => call.path === "/api/payments/payment-1" && call.method === "PUT")).toBe(true));
    const update = requests.find((call) => call.path === "/api/payments/payment-1" && call.method === "PUT")!;
    expect(update.body).toMatchObject({ status: "paid", amount: 12000, principalPart: 10000, interestPart: 2000 });
  });
});
