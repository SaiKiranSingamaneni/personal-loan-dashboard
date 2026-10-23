import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LoanItem {
  id: string;
  name: string;
  lender: string;
  loanType: string;
  status: "active" | "closed";
  archivedAt: string | null;
}
interface LoanMetrics {
  outstandingPrincipal: number;
  emi: number;
  totalInterest: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
}
interface LoanSummaryResponse {
  loan: LoanItem;
  summary: LoanMetrics;
}

function dateLabel(value: string | null): string {
  if (value === null) return "No upcoming dues";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function AllLoansOverview() {
  const loansQuery = useQuery({ queryKey: ["loans"], queryFn: () => apiRequest<LoanItem[]>("/api/loans") });
  const loans = loansQuery.data ?? [];
  const summaryQueries = useQueries({
    queries: loans.map((loan) => ({
      queryKey: ["loans", loan.id, "summary"],
      queryFn: () => apiRequest<LoanSummaryResponse>(`/api/loans/${loan.id}/summary`),
      staleTime: 30_000,
    })),
  });
  const rows = useMemo(() => loans.flatMap((loan, index) => {
    const summary = summaryQueries[index]?.data?.summary;
    return summary === undefined ? [] : [{ loan, ...summary }];
  }), [loans, summaryQueries.map((query) => query.dataUpdatedAt).join(",")]);
  const loading = loansQuery.isPending || summaryQueries.some((query) => query.isPending);
  const error = loansQuery.error ?? summaryQueries.find((query) => query.error)?.error;
  const totals = rows.reduce((result, row) => ({
    outstanding: result.outstanding + row.outstandingPrincipal,
    emi: result.emi + row.emi,
    interest: result.interest + row.totalInterest,
  }), { outstanding: 0, emi: 0, interest: 0 });
  const upcoming = rows
    .filter((row) => row.nextDueDate !== null && row.nextDueAmount !== null)
    .sort((left, right) => left.nextDueDate!.localeCompare(right.nextDueDate!));
  const chartData = rows.map((row) => ({ name: row.loan.name, outstanding: row.outstandingPrincipal }));

  if (loading) return <div className="panel-skeleton" aria-label="Loading all-loans overview" />;
  if (error) return <div className="notice notice-error" role="alert">Could not load the all-loans overview.</div>;
  if (loans.length === 0) return <section className="empty-state"><div className="empty-icon" aria-hidden="true">₹</div><h1>All loans</h1><p>Add a loan to see your combined balance and upcoming dues.</p><Link className="button button-primary" to="/loans/new">Add a loan</Link></section>;

  return (
    <div className="all-loans-overview">
      <div className="page-heading overview-heading"><div><div className="eyebrow">PERSONAL FINANCE</div><h1>All loans</h1><p>Combined balances, monthly commitments, and upcoming dues.</p></div><Link className="button button-primary" to="/loans/new">+ Add loan</Link></div>
      <div className="summary-grid overview-summary-grid">
        <article className="summary-card"><span className="summary-label">Total outstanding</span><strong className="summary-value">{formatIndianMoney(asPaise(totals.outstanding))}</strong><span className="summary-note">Across {loans.length} loans</span></article>
        <article className="summary-card"><span className="summary-label">Combined EMI / month</span><strong className="summary-value">{formatIndianMoney(asPaise(totals.emi))}</strong><span className="summary-note">Total scheduled installment amount</span></article>
        <article className="summary-card"><span className="summary-label">Total projected interest</span><strong className="summary-value">{formatIndianMoney(asPaise(totals.interest))}</strong><span className="summary-note">Over remaining loan schedules</span></article>
      </div>
      <div className="overview-content-grid">
        <section className="chart-card overview-comparison-card" aria-label="Loan outstanding comparison">
          <div className="chart-heading"><div><h2>Outstanding by loan</h2><p>Compare current principal balances</p></div></div>
          <div className="overview-comparison-chart" role="img" aria-label="Bar chart comparing outstanding balance for each loan">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value: number) => `₹${(value / 100_000).toFixed(0)}L`} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={105} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <Tooltip formatter={(value) => [formatIndianMoney(asPaise(Number(value ?? 0))), "Outstanding"]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }} />
                <Legend />
                <Bar dataKey="outstanding" name="Outstanding principal" fill="#4d71dc" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="chart-card upcoming-dues-card" aria-label="Combined upcoming dues">
          <div className="chart-heading"><div><h2>Upcoming dues</h2><p>Next scheduled payment for each loan</p></div><span className="loan-count">{upcoming.length}</span></div>
          {upcoming.length === 0 ? <p className="entry-empty">No upcoming dues found.</p> : <ul className="upcoming-dues-list">{upcoming.map((row) => <li key={row.loan.id}>
            <Link to={`/loans/${row.loan.id}`}><span className="loan-avatar avatar-0" aria-hidden="true">{row.loan.name.slice(0, 1).toUpperCase()}</span><span className="upcoming-due-copy"><strong>{row.loan.name}</strong><small>{dateLabel(row.nextDueDate)}</small></span></Link>
            <strong className="entry-amount">{formatIndianMoney(asPaise(row.nextDueAmount!))}</strong>
          </li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
