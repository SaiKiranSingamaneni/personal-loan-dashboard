import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

export interface AmortizationTableRow {
  period: number;
  dueDate: string;
  openingBalance: number;
  emi: number;
  principal: number;
  interest: number;
  closingBalance: number;
  status: "scheduled" | "paid" | "missed";
}
export type ScheduleSortKey = "period" | "dueDate" | "openingBalance" | "emi" | "principal" | "interest" | "closingBalance";

export function sortScheduleRows(rows: readonly AmortizationTableRow[], sortBy: ScheduleSortKey, direction: "asc" | "desc"): AmortizationTableRow[] {
  return [...rows].sort((left, right) => {
    const a = left[sortBy];
    const b = right[sortBy];
    const comparison = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
    return direction === "asc" ? comparison : -comparison;
  });
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function amortizationCsv(rows: readonly AmortizationTableRow[]): string {
  const header = ["Period", "Due date", "Opening balance (INR)", "EMI (INR)", "Principal (INR)", "Interest (INR)", "Closing balance (INR)", "Status"];
  const lines = rows.map((row) => [
    String(row.period), row.dueDate, (row.openingBalance / 100).toFixed(2), (row.emi / 100).toFixed(2),
    (row.principal / 100).toFixed(2), (row.interest / 100).toFixed(2), (row.closingBalance / 100).toFixed(2), row.status,
  ]);
  return [header, ...lines].map((line) => line.map(csvEscape).join(",")).join("\r\n");
}

const columns: { key: ScheduleSortKey; label: string }[] = [
  { key: "period", label: "Period" },
  { key: "dueDate", label: "Due date" },
  { key: "openingBalance", label: "Opening balance" },
  { key: "emi", label: "EMI" },
  { key: "principal", label: "Principal" },
  { key: "interest", label: "Interest" },
  { key: "closingBalance", label: "Closing balance" },
];

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function AmortizationTable({ loanId }: { loanId: string }) {
  const [sortBy, setSortBy] = useState<ScheduleSortKey>("period");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const scheduleQuery = useQuery({
    queryKey: ["loans", loanId, "schedule", "table"],
    queryFn: () => apiRequest<AmortizationTableRow[]>(`/api/loans/${loanId}/schedule`),
  });
  const rows = useMemo(() => sortScheduleRows(scheduleQuery.data ?? [], sortBy, direction), [direction, scheduleQuery.data, sortBy]);

  function downloadCsv() {
    const blob = new Blob([amortizationCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `loan-${loanId}-amortization.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="amortization-card" aria-label="Amortization schedule">
      <div className="chart-heading amortization-heading">
        <div><h2>Amortization schedule</h2><p>Monthly reducing-balance schedule and payment status</p></div>
        <button className="button button-secondary" type="button" onClick={downloadCsv} disabled={!rows.length}>Export CSV</button>
      </div>
      <div className="amortization-controls">
        <label className="form-field" htmlFor="schedule-sort">Sort by<select id="schedule-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as ScheduleSortKey)}>
          {columns.map((column) => <option value={column.key} key={column.key}>{column.label}</option>)}
        </select></label>
        <button className="button button-secondary" type="button" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")} aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}>
          {direction === "asc" ? "Ascending ↑" : "Descending ↓"}
        </button>
      </div>
      {scheduleQuery.isPending ? <div className="panel-skeleton" aria-label="Loading amortization schedule" /> : scheduleQuery.error ? <div className="notice notice-error" role="alert">Could not load the amortization schedule.</div> : rows.length === 0 ? <div className="chart-empty">No amortization schedule is available.</div> : (
        <div className="amortization-table-scroll">
          <table className="amortization-table">
            <thead><tr>{columns.map((column) => <th key={column.key} scope="col" aria-sort={sortBy === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => { if (sortBy === column.key) setDirection((value) => value === "asc" ? "desc" : "asc"); else { setSortBy(column.key); setDirection("asc"); } }}>{column.label}{sortBy === column.key ? direction === "asc" ? " ↑" : " ↓" : ""}</button></th>)}<th scope="col">Status</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.period} className={row.status === "paid" ? "schedule-row-paid" : row.status === "missed" ? "schedule-row-missed" : ""}>
              <td>{row.period}</td><td>{dateLabel(row.dueDate)}</td><td>{formatIndianMoney(asPaise(row.openingBalance))}</td><td>{formatIndianMoney(asPaise(row.emi))}</td><td>{formatIndianMoney(asPaise(row.principal))}</td><td>{formatIndianMoney(asPaise(row.interest))}</td><td>{formatIndianMoney(asPaise(row.closingBalance))}</td>
              <td><span className={`schedule-status status-${row.status}`}>{row.status === "paid" ? "✓ Paid" : row.status === "missed" ? "Missed" : "Scheduled"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
