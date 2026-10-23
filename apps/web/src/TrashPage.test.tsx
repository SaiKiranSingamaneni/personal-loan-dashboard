// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TrashPage } from "./TrashPage.js";

function response(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Trash page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("restores an entry and requires confirmation before permanent deletion", async () => {
    const user = userEvent.setup();
    let rows: Record<string, unknown>[] = [
      { id: "note-1", entityType: "note", loanId: "loan-1", date: "2026-10-01", text: "Old note", deletedAt: "2026-10-02T00:00:00.000Z" },
      { id: "payment-1", entityType: "payment", loanId: "loan-1", date: "2026-10-02", type: "emi", amount: 10000, deletedAt: "2026-10-03T00:00:00.000Z" },
    ];
    const requests: { path: string; method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), window.location.origin).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ path, method, ...(body === undefined ? {} : { body }) });
      if (path === "/api/trash" && method === "GET") return response(rows);
      if (path === "/api/trash/note/note-1/restore") {
        rows = rows.filter((row) => row.id !== "note-1");
        return response(undefined, 204);
      }
      if (path === "/api/trash/payment/payment-1" && method === "DELETE") {
        rows = rows.filter((row) => row.id !== "payment-1");
        return response(undefined, 204);
      }
      return response({ error: { message: "Unexpected request" } }, 404);
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><TrashPage /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByText("Old note")).toBeTruthy();
    const noteRow = screen.getByText("Old note").closest("li");
    expect(noteRow).not.toBeNull();
    await user.click(within(noteRow!).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(requests.some((request) => request.path === "/api/trash/note/note-1/restore")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Old note")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(requests.some((request) => request.path === "/api/trash/payment/payment-1" && request.method === "DELETE")).toBe(true));
    expect(requests.find((request) => request.method === "DELETE")?.body).toEqual({ confirmation: "DELETE" });
    expect(await screen.findByText("Trash is empty")).toBeTruthy();
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });
});
