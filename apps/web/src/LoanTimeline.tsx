import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

type TimelineType = "payment" | "disbursement" | "contribution" | "rate-change" | "note";
interface TimelineItem {
  id: string;
  entryId: string;
  type: TimelineType;
  date: string;
  amount: number | null;
  detail: string;
  status?: string;
  upcoming: boolean;
  overdue: boolean;
}
interface TimelineQuery {
  type: "all" | TimelineType;
  from: string;
  to: string;
  q: string;
  order: "asc" | "desc";
  completedEmis: "all" | "completed";
}

const timelineTypeLabels: Record<TimelineType, string> = {
  payment: "Payment",
  disbursement: "Disbursement",
  contribution: "Own contribution",
  "rate-change": "Rate change",
  note: "Note",
};

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, 1)));
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function buildTimelinePath(loanId: string, filters: TimelineQuery): string {
  const params = new URLSearchParams();
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.from !== "") params.set("from", filters.from);
  if (filters.to !== "") params.set("to", filters.to);
  if (filters.q.trim() !== "") params.set("q", filters.q.trim());
  params.set("order", filters.order);
  if (filters.completedEmis === "completed") params.set("completedEmis", "true");
  return `/api/loans/${loanId}/timeline?${params.toString()}`;
}

export function LoanTimeline({ loanId }: { loanId: string }) {
  const pageSize = 10;
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [filters, setFilters] = useState<TimelineQuery>({ type: "all", from: "", to: "", q: "", order: "desc", completedEmis: "all" });
  const timelineQuery = useQuery({
    queryKey: ["loans", loanId, "timeline", filters],
    queryFn: () => apiRequest<TimelineItem[]>(buildTimelinePath(loanId, filters)),
  });
  const sections = useMemo(() => {
    const rows = timelineQuery.data ?? [];
    const upcoming = rows.filter((item) => item.upcoming).sort((left, right) => left.date.localeCompare(right.date));
    const history = rows.filter((item) => !item.upcoming);
    const months = new Map<string, TimelineItem[]>();
    for (const item of history) {
      const key = item.date.slice(0, 7);
      months.set(key, [...(months.get(key) ?? []), item]);
    }
    return { upcoming, months: [...months.entries()] };
  }, [timelineQuery.data]);
  const upcomingPages = Math.ceil(sections.upcoming.length / pageSize);
  const pagedUpcoming = sections.upcoming.slice(upcomingPage * pageSize, (upcomingPage + 1) * pageSize);

  useEffect(() => setUpcomingPage(0), [loanId, filters]);

  function updateFilter<Key extends keyof TimelineQuery>(key: Key, value: TimelineQuery[Key]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function monthPaidTotal(items: TimelineItem[]): number {
    return items.reduce((sum, item) => sum + (item.type === "payment" && item.status === "paid" ? item.amount ?? 0 : 0), 0);
  }

  function row(item: TimelineItem) {
    const separator = item.detail.indexOf(" — ");
    const noteText = item.type === "note" ? item.detail : separator >= 0 ? item.detail.slice(separator + 3) : "";
    const title = item.type === "note" ? "" : separator >= 0 ? item.detail.slice(0, separator) : item.detail;
    return (
      <li className={`timeline-item${item.upcoming ? " is-upcoming" : ""}${item.overdue ? " is-overdue" : ""}${item.type === "payment" && item.status === "paid" ? " is-completed" : ""}`} key={item.id}>
        <span className={`timeline-marker timeline-marker-${item.type}`} aria-hidden="true" />
        <div className="timeline-item-copy">
          {noteText !== "" && <span className="entry-note">{noteText}</span>}
          <span className="entry-kind">{timelineTypeLabels[item.type]}</span>
          {title !== "" && <strong>{title}</strong>}
          <span className="entry-date">{dateLabel(item.date)}{item.type === "payment" && item.status === "paid" ? " · Completed" : item.status ? ` · ${item.status}` : ""}</span>
        </div>
        <div className="timeline-item-end">
          {item.amount !== null && <span className="entry-amount">{formatIndianMoney(asPaise(item.amount))}</span>}
          {item.overdue && <span className="timeline-state state-overdue">Overdue</span>}
          {item.upcoming && <span className="timeline-state state-upcoming">Upcoming</span>}
        </div>
      </li>
    );
  }

  return (
    <section className="timeline-card" aria-label="Loan timeline">
      <div className="chart-heading"><div><h2>Timeline</h2><p>All loan activity in date order</p></div>
        <button className="button button-secondary" type="button" onClick={() => updateFilter("order", filters.order === "desc" ? "asc" : "desc")} aria-label={`Sort ${filters.order === "desc" ? "oldest first" : "newest first"}`}>
          {filters.order === "desc" ? "Newest first ↓" : "Oldest first ↑"}
        </button>
      </div>
      <div className="timeline-filters">
        <label className="form-field" htmlFor="timeline-type">Type<select id="timeline-type" value={filters.type} onChange={(event) => updateFilter("type", event.target.value as TimelineQuery["type"])}>
          <option value="all">All activity</option>{Object.entries(timelineTypeLabels).map(([type, label]) => <option value={type} key={type}>{label}</option>)}
        </select></label>
        <label className="form-field" htmlFor="timeline-completed-emis">EMI status<select id="timeline-completed-emis" value={filters.completedEmis} onChange={(event) => updateFilter("completedEmis", event.target.value as TimelineQuery["completedEmis"])}><option value="all">All activity</option><option value="completed">Completed EMI payments</option></select></label>
        <label className="form-field" htmlFor="timeline-from">From<input id="timeline-from" type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
        <label className="form-field" htmlFor="timeline-to">To<input id="timeline-to" type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
        <label className="form-field timeline-search" htmlFor="timeline-search">Search<input id="timeline-search" type="search" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search activity" /></label>
      </div>
      {timelineQuery.isPending ? <div className="panel-skeleton" aria-label="Loading timeline" /> : timelineQuery.error ? <div className="notice notice-error" role="alert">Could not load the timeline.</div> : sections.upcoming.length === 0 && sections.months.length === 0 ? <p className="entry-empty">No activity matches these filters.</p> : (
        <div className="timeline-sections">
          {sections.upcoming.length > 0 && <section className="timeline-group upcoming-group"><div className="timeline-group-heading"><h3>Upcoming</h3><span>{sections.upcoming.length} {sections.upcoming.length === 1 ? "entry" : "entries"} · soonest first</span></div><div className="upcoming-table-scroll" role="region" aria-label="Upcoming activity" tabIndex={0}><ol className="timeline-list">{pagedUpcoming.map(row)}</ol></div>{upcomingPages > 1 && <nav className="upcoming-pagination" aria-label="Upcoming activity pages"><span>Showing {upcomingPage * pageSize + 1}–{Math.min((upcomingPage + 1) * pageSize, sections.upcoming.length)} of {sections.upcoming.length}</span><div><button type="button" className="button button-secondary" disabled={upcomingPage === 0} onClick={() => setUpcomingPage((page) => page - 1)}>Previous</button><span>Page {upcomingPage + 1} of {upcomingPages}</span><button type="button" className="button button-secondary" disabled={upcomingPage + 1 >= upcomingPages} onClick={() => setUpcomingPage((page) => page + 1)}>Next</button></div></nav>}</section>}
          {sections.months.map(([month, items]) => <section className="timeline-group" key={month}>
            <div className="timeline-group-heading"><h3>{monthLabel(month)}</h3><span>Paid {formatIndianMoney(asPaise(monthPaidTotal(items)))}</span></div>
            <ol className="timeline-list">{items.map(row)}</ol>
          </section>)}
        </div>
      )}
    </section>
  );
}
