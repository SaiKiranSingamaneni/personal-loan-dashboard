import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface SchedulePeriod {
  dueDate: string;
  principal: number;
  interest: number;
}
type Period = "monthly" | "yearly";
interface TotalsRow {
  key: string;
  label: string;
  principal: number;
  interest: number;
}

export function aggregatePrincipalInterest(rows: SchedulePeriod[], period: Period): TotalsRow[] {
  const grouped = new Map<string, TotalsRow>();
  for (const row of rows) {
    const key = period === "yearly" ? row.dueDate.slice(0, 4) : row.dueDate.slice(0, 7);
    const label = period === "yearly"
      ? key
      : new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
          .format(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)));
    const current = grouped.get(key) ?? { key, label, principal: 0, interest: 0 };
    current.principal += row.principal;
    current.interest += row.interest;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function PrincipalInterestChart({ loanId }: { loanId: string }) {
  const [period, setPeriod] = useState<Period>("monthly");
  const scheduleQuery = useQuery({
    queryKey: ["loans", loanId, "schedule", "principal-interest"],
    queryFn: () => apiRequest<SchedulePeriod[]>(`/api/loans/${loanId}/schedule`),
  });
  const data = useMemo(
    () => aggregatePrincipalInterest(scheduleQuery.data ?? [], period),
    [period, scheduleQuery.data],
  );

  return (
    <section className="chart-card principal-interest-card" aria-label="Principal versus interest chart">
      <div className="chart-heading">
        <div><h2>Principal vs interest</h2><p>Scheduled payment split by period</p></div>
        <div className="chart-toggle" role="group" aria-label="Chart period">
          <button type="button" className={period === "monthly" ? "is-selected" : ""} aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")}>Monthly</button>
          <button type="button" className={period === "yearly" ? "is-selected" : ""} aria-pressed={period === "yearly"} onClick={() => setPeriod("yearly")}>Yearly</button>
        </div>
      </div>
      {scheduleQuery.isPending ? <div className="panel-skeleton" aria-label="Loading principal and interest chart" /> : scheduleQuery.error ? <div className="notice notice-error" role="alert">Could not load the amortization split.</div> : data.length === 0 ? <div className="chart-empty">No scheduled payments are available.</div> : (
        <div className="principal-interest-chart" role="img" aria-label={`${period} stacked principal and interest chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 10 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} minTickGap={15} />
              <YAxis tickFormatter={(value: number) => `₹${(value / 100_000).toFixed(0)}L`} tick={{ fill: "var(--muted)", fontSize: 10 }} width={54} />
              <Tooltip formatter={(value, name) => [formatIndianMoney(asPaise(Number(value ?? 0))), String(name)]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }} />
              <Legend />
              <Bar dataKey="principal" name="Principal" stackId="payment" fill="#4d71dc" radius={[0, 0, 2, 2]} />
              <Bar dataKey="interest" name="Interest" stackId="payment" fill="#e49a52" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
