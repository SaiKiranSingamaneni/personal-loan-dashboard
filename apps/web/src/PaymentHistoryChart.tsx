import { useMemo } from "react";
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

interface PaymentRow {
  date: string;
  amount: number;
  status: "scheduled" | "paid" | "missed";
}
interface PaymentHistoryMonth {
  month: string;
  label: string;
  actualPaid: number;
  scheduled: number;
  missed: number;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, 1)));
}

export function aggregatePaymentHistory(payments: readonly PaymentRow[]): PaymentHistoryMonth[] {
  const grouped = new Map<string, PaymentHistoryMonth>();
  for (const payment of payments) {
    const month = payment.date.slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      label: monthLabel(month),
      actualPaid: 0,
      scheduled: 0,
      missed: 0,
    };
    if (payment.status === "paid") current.actualPaid += payment.amount;
    if (payment.status === "scheduled") current.scheduled += payment.amount;
    if (payment.status === "missed") current.missed += payment.amount;
    grouped.set(month, current);
  }
  return [...grouped.values()].sort((left, right) => left.month.localeCompare(right.month));
}

export function PaymentHistoryChart({ loanId }: { loanId: string }) {
  const paymentsQuery = useQuery({
    queryKey: ["loans", loanId, "payments", "history"],
    queryFn: () => apiRequest<PaymentRow[]>(`/api/loans/${loanId}/payments`),
  });
  const data = useMemo(() => aggregatePaymentHistory(paymentsQuery.data ?? []), [paymentsQuery.data]);

  return (
    <section className="chart-card payment-history-card" aria-label="Payment history chart">
      <div className="chart-heading"><div><h2>Payment history</h2><p>Paid, scheduled, and missed amounts by month</p></div></div>
      {paymentsQuery.isPending ? <div className="panel-skeleton" aria-label="Loading payment history chart" /> : paymentsQuery.error ? <div className="notice notice-error" role="alert">Could not load payment history.</div> : data.length === 0 ? <div className="chart-empty">Scheduled payments will appear here after they are generated.</div> : (
        <div className="payment-history-chart" role="img" aria-label="Monthly actual paid versus scheduled payments, with missed amounts highlighted">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 10 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} minTickGap={15} />
              <YAxis tickFormatter={(value: number) => `₹${(value / 100_000).toFixed(0)}L`} tick={{ fill: "var(--muted)", fontSize: 10 }} width={54} />
              <Tooltip formatter={(value, name) => [formatIndianMoney(asPaise(Number(value ?? 0))), String(name)]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }} />
              <Legend />
              <Bar dataKey="actualPaid" name="Actual paid" fill="#42a27f" radius={[3, 3, 0, 0]} />
              <Bar dataKey="scheduled" name="Scheduled" fill="#4d71dc" radius={[3, 3, 0, 0]} />
              <Bar dataKey="missed" name="Missed" fill="#c95850" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
