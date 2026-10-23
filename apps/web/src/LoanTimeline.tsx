import { useMemo, useState } from "react";
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
  return `/api/loans/${loanId}/timeline?${params.toString()}`;
}

export function LoanTimeline({ loanId }: { loanId: string }) {
  const [filters, setFilters] = useState<TimelineQuery>({ type: "all", from: "", to: "", q: "", order: "desc" });
  const timelineQuery = useQuery({
    queryKey: ["loans", loanId, "timeline", filters],
    queryFn: () => apiRequest<TimelineItem[]>(buildTimelinePath(loanId, filters)),
  });
  const sections = useMemo(() => {
    const rows = timelineQuery.data ?? [];
    const upcoming = rows.filter((item) => item.upcoming);
    const history = rows.filter((item) => !item.upcoming);
    const months = new Map<string, TimelineItem[]>();
    for (const item of history) {
      const key = item.date.slice(0, 7);
      months.set(key, [...(months.get(key) ?? []), item]);
    }
    return { upcoming, months: [...months.entries()] };
  }, [timelineQuery.data]);

  function updateFilter<Key extends keyof TimelineQuery>(key: Key, value: TimelineQuery[Key]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function monthPaidTotal(items: TimelineItem[]): number {
    return items.reduce((sum, item) => sum + (item.type === "payment" && item.status === "paid" ? item.amount ?? 0 : 0), 0);
  }

  function row(item: TimelineItem) {
    return (
      <li className={`timeline-item${item.upcoming ? " is-upcoming" : ""}${item.overdue ? " is-overdue" : ""}`} key={item.id}>
        <span className={`timeline-marker timeline-marker-${item.type}`} aria-hidden="true" />
        <div className="timeline-item-copy">
          <span className="entry-kind">{timelineTypeLabels[item.type]}</span>
          <strong>{item.detail}</strong>
          <span className="entry-date">{dateLabel(item.date)}{item.status ? ` · ${item.status}` : ""}</span>
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
        <label className="form-field" htmlFor="timeline-from">From<input id="timeline-from" type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
        <label className="form-field" htmlFor="timeline-to">To<input id="timeline-to" type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
        <label className="form-field timeline-search" htmlFor="timeline-search">Search<input id="timeline-search" type="search" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search activity" /></label>
      </div>
      {timelineQuery.isPending ? <div className="panel-skeleton" aria-label="Loading timeline" /> : timelineQuery.error ? <div className="notice notice-error" role="alert">Could not load the timeline.</div> : sections.upcoming.length === 0 && sections.months.length === 0 ? <p className="entry-empty">No activity matches these filters.</p> : (
        <div className="timeline-sections">
          {sections.upcoming.length > 0 && <section className="timeline-group upcoming-group"><div className="timeline-group-heading"><h3>Upcoming</h3><span>{sections.upcoming.length} {sections.upcoming.length === 1 ? "entry" : "entries"}</span></div><ol className="timeline-list">{sections.upcoming.map(row)}</ol></section>}
          {sections.months.map(([month, items]) => <section className="timeline-group" key={month}>
            <div className="timeline-group-heading"><h3>{monthLabel(month)}</h3><span>Paid {formatIndianMoney(asPaise(monthPaidTotal(items)))}</span></div>
            <ol className="timeline-list">{items.map(row)}</ol>
          </section>)}
        </div>
      )}
    </section>
  );
}
