// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoanEntries } from "./LoanEntries.js";

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
});
