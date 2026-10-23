import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";
import type { ActivityEntryType, ActivityFormEntry } from "./ActivityEntryForm.js";

type ActivityStatus = "PAID" | "MISSED" | "SKIPPED" | "UPCOMING";
interface ActivityRow extends ActivityFormEntry {
  interestPart: number | null;
  principalPart: number | null;
}
interface ActivityResponse {
  items: ActivityRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: { selfContributions: number; loanDisbursed: number; emisPaid: number; extraPayments: number };
}
const types: { value: ActivityEntryType; label: string }[] = [
  { value: "SELF_CONTRIBUTION", label: "Self contribution" },
  { value: "LOAN_DISBURSEMENT", label: "Loan disbursement" },
  { value: "EMI", label: "EMI" },
  { value: "EXTRA_EMI", label: "Extra EMI" },
  { value: "RATE_CHANGE", label: "Rate change" },
];
const statusOptions: ActivityStatus[] = ["PAID", "MISSED", "SKIPPED", "UPCOMING"];

function money(value: number): string { return formatIndianMoney(asPaise(value)); }
function entryTypeLabel(type: ActivityEntryType): string { return types.find((item) => item.value === type)?.label ?? type; }
function statusLabel(status: string | null | undefined): string { return status === "UPCOMING" ? "Upcoming" : (status ?? "—").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }

export function ActivityTable({ loanId, onEdit }: { loanId: string; onEdit: (entry: ActivityFormEntry) => void }) {
  const queryClient = useQueryClient();
  const [selectedTypes, setSelectedTypes] = useState<ActivityEntryType[]>([]);
  const [status, setStatus] = useState<ActivityStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [expanded, setExpanded] = useState<string[]>([]);
  const query = new URLSearchParams();
  if (selectedTypes.length > 0) query.set("type", selectedTypes.join(","));
  if (status) query.set("status", status);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (search.trim()) query.set("q", search.trim());
  query.set("sort", sort);
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));
  const queryString = query.toString();
  const activityQuery = useQuery({
    queryKey: ["loans", loanId, "activity", queryString],
    queryFn: () => apiRequest<ActivityResponse>(`/api/loans/${loanId}/activity?${queryString}`),
    placeholderData: (previous) => previous,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/api/activity/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "activity"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["trash"] }),
      ]);
    },
  });
  const result = activityQuery.data;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));
  const activeChips = [
    ...selectedTypes.map((type) => ({ key: `type-${type}`, label: entryTypeLabel(type), clear: () => setSelectedTypes((current) => current.filter((item) => item !== type)) })),
    ...(status ? [{ key: "status", label: statusLabel(status), clear: () => setStatus("") }] : []),
    ...(from ? [{ key: "from", label: `From ${from}`, clear: () => setFrom("") }] : []),
    ...(to ? [{ key: "to", label: `To ${to}`, clear: () => setTo("") }] : []),
    ...(search.trim() ? [{ key: "q", label: `Search: ${search.trim()}`, clear: () => setSearch("") }] : []),
  ];

  function changePage(next: number) { setPage(Math.max(1, Math.min(pageCount, next))); }
  function clearFilters() {
    setSelectedTypes([]); setStatus(""); setFrom(""); setTo(""); setSearch(""); setSort("newest"); setPage(1);
  }
  function toggleType(type: ActivityEntryType) {
    setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
    setPage(1);
  }
  function toggleNotes(id: string) {
    setExpanded((current) => current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id]);
  }

  return <section className="activity-table-section" aria-label="Activity history">
    <header className="activity-table-heading"><div><h2>Activity history</h2><p>All loan payments, funding, and changes in one place.</p></div><span className="activity-result-count">{result?.total ?? 0} entries</span></header>
    <div className="activity-totals-strip" aria-label="Totals for current filters">
      <div><span>Self contributions</span><strong>{money(result?.totals.selfContributions ?? 0)}</strong></div>
      <div><span>Loan disbursed</span><strong>{money(result?.totals.loanDisbursed ?? 0)}</strong></div>
      <div><span>EMIs paid</span><strong>{money(result?.totals.emisPaid ?? 0)}</strong></div>
      <div><span>Extra payments</span><strong>{money(result?.totals.extraPayments ?? 0)}</strong></div>
    </div>
    <div className="activity-filter-controls">
      <fieldset className="activity-type-filter"><legend>Type</legend>{types.map((item) => <label key={item.value}><input type="checkbox" checked={selectedTypes.includes(item.value)} onChange={() => toggleType(item.value)} />{item.label}</label>)}</fieldset>
      <label className="form-field">Status<select value={status} onChange={(event) => { setStatus(event.target.value as ActivityStatus | ""); setPage(1); }}><option value="">All statuses</option>{statusOptions.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
      <label className="form-field">From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
      <label className="form-field">To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
      <label className="form-field activity-search-field">Search<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Title or notes" /></label>
      <label className="form-field">Sort<select value={sort} onChange={(event) => { setSort(event.target.value as "newest" | "oldest"); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <button className="button button-secondary" type="button" onClick={clearFilters} disabled={activeChips.length === 0 && sort === "newest"}>Clear filters</button>
    </div>
    {activeChips.length > 0 && <div className="activity-filter-chips" aria-label="Active filters">{activeChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear}>{chip.label}<span aria-hidden="true"> ×</span></button>)}</div>}
    {activityQuery.isPending ? <div className="panel-skeleton" aria-label="Loading activity" /> : activityQuery.error ? <div className="notice notice-error" role="alert">Could not load activity history.</div> : (
      <>
        <div className="activity-table-scroll" role="region" aria-label="Activity entries table" tabIndex={0}>
          <table className="activity-data-table"><thead><tr><th>Date</th><th>Type</th><th>Title and notes</th><th>Amount</th><th>Interest</th><th>Principal</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{result?.items.map((entry) => {
              const isUpcoming = entry.status === "UPCOMING";
              const notesExpanded = expanded.includes(entry.id);
              return <tr key={entry.id} className={isUpcoming ? "is-upcoming-row" : ""}>
                <td className="activity-date-cell">{entry.date}</td>
                <td><span className={`activity-type-badge type-${entry.type.toLowerCase()}`}>{entryTypeLabel(entry.type)}</span>{entry.origin === "AUTO" && <span className="activity-auto-tag">Auto</span>}</td>
                <td className="activity-title-cell"><strong>{entry.title}</strong>{entry.notes && <button type="button" className={`activity-notes${notesExpanded ? " is-expanded" : ""}`} onClick={() => toggleNotes(entry.id)} aria-expanded={notesExpanded}>{entry.notes}</button>}</td>
                <td>{entry.amount === null ? "—" : money(entry.amount)}</td>
                <td>{entry.type === "EMI" || entry.type === "EXTRA_EMI" ? money(entry.interestPart ?? 0) : "—"}</td>
                <td>{entry.type === "EMI" || entry.type === "EXTRA_EMI" ? money(entry.principalPart ?? 0) : "—"}</td>
                <td><span className={`activity-status status-${(entry.status ?? "none").toLowerCase()}`}>{statusLabel(entry.status)}</span></td>
                <td><div className="activity-row-actions"><button type="button" className="icon-button" title="Edit entry" aria-label={`Edit ${entry.title}`} disabled={isUpcoming} onClick={() => onEdit(entry)}>✎</button><button type="button" className="icon-button" title="Delete entry" aria-label={`Delete ${entry.title}`} disabled={isUpcoming} onClick={() => { if (window.confirm(`Move “${entry.title}” to Trash?`)) deleteMutation.mutate(entry.id); }}>×</button></div></td>
              </tr>;
            })}</tbody>
          </table>
          {result?.items.length === 0 && <p className="entry-empty">No activity matches these filters.</p>}
        </div>
        <nav className="activity-pagination" aria-label="Activity pages">
          <label>Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 10 | 25 | 50); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <span>Showing {result?.total ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, result?.total ?? 0)} of {result?.total ?? 0}</span>
          <div><button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => changePage(page - 1)}>‹</button>{Array.from({ length: pageCount }, (_value, index) => index + 1).slice(Math.max(0, page - 3), Math.min(pageCount, page + 2)).map((pageNumber) => <button type="button" key={pageNumber} className={`activity-page-number${pageNumber === page ? " is-current" : ""}`} aria-current={pageNumber === page ? "page" : undefined} onClick={() => changePage(pageNumber)}>{pageNumber}</button>)}<button type="button" className="icon-button" aria-label="Next page" disabled={page >= pageCount} onClick={() => changePage(page + 1)}>›</button></div>
        </nav>
      </>
    )}
  </section>;
}