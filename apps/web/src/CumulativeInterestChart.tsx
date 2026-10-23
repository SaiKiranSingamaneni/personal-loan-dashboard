import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface InterestPayment {
  date: string;
  interestPart: number;
  status: "scheduled" | "paid" | "missed";
}
interface InterestPoint {
  month: string;
  label: string;
  cumulativeInterest: number;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, 1)));
}

function nextMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, 1));
  return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

export function buildCumulativeInterestSeries(payments: InterestPayment[], today: string): InterestPoint[] {
  const paid = payments.filter((payment) => payment.status === "paid");
  if (paid.length === 0) return [];
  const interestByMonth = new Map<string, number>();
  for (const payment of paid) {
    const month = payment.date.slice(0, 7);
    interestByMonth.set(month, (interestByMonth.get(month) ?? 0) + payment.interestPart);
  }
  const months = [...interestByMonth.keys()].sort();
  const firstMonth = months[0]!;
  const lastPaidMonth = months.at(-1)!;
  const lastMonth = today.slice(0, 7) > lastPaidMonth ? today.slice(0, 7) : lastPaidMonth;
  const series: InterestPoint[] = [];
  let cumulativeInterest = 0;
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    cumulativeInterest += interestByMonth.get(month) ?? 0;
    series.push({ month, label: monthLabel(month), cumulativeInterest });
  }
  return series;
}

export function CumulativeInterestChart({ loanId }: { loanId: string }) {
  const paymentsQuery = useQuery({
    queryKey: ["loans", loanId, "payments", "cumulative-interest"],
    queryFn: () => apiRequest<InterestPayment[]>(`/api/loans/${loanId}/payments`),
  });
  const data = useMemo(
    () => buildCumulativeInterestSeries(paymentsQuery.data ?? [], new Date().toISOString().slice(0, 10)),
    [paymentsQuery.data],
  );

  return (
    <section className="chart-card cumulative-interest-card" aria-label="Cumulative interest paid chart">
      <div className="chart-heading"><div><h2>Cumulative interest paid</h2><p>Interest recorded on paid installments</p></div></div>
      {paymentsQuery.isPending ? <div className="panel-skeleton" aria-label="Loading cumulative interest chart" /> : paymentsQuery.error ? <div className="notice notice-error" role="alert">Could not load paid interest history.</div> : data.length === 0 ? <div className="chart-empty">Paid interest will appear here when payments are recorded.</div> : (
        <div className="cumulative-interest-chart" role="img" aria-label="Area chart of cumulative interest paid">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 10 }}>
              <defs><linearGradient id="interestPaidFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8755bc" stopOpacity={0.32} /><stop offset="95%" stopColor="#8755bc" stopOpacity={0.03} /></linearGradient></defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} minTickGap={16} />
              <YAxis tickFormatter={(value: number) => `₹${(value / 100_000).toFixed(1)}L`} tick={{ fill: "var(--muted)", fontSize: 10 }} width={58} />
              <Tooltip formatter={(value) => [formatIndianMoney(asPaise(Number(value ?? 0))), "Interest paid to date"]} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }} />
              <Legend />
              <Area type="monotone" dataKey="cumulativeInterest" name="Interest paid to date" stroke="#8755bc" strokeWidth={2.5} fill="url(#interestPaidFill)" activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
