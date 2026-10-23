import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ScheduleRow {
  period: number;
  dueDate: string;
  openingBalance: number;
  emi: number;
  principal: number;
  interest: number;
  closingBalance: number;
}
interface PaymentRow {
  date: string;
  amount: number;
  principalPart: number;
  interestPart: number;
  status: "scheduled" | "paid" | "missed";
}
interface DisbursementRow {
  date: string;
  amount: number;
}
interface BalancePoint {
  date: string;
  projected: number;
  actual: number | null;
}

export function buildBalanceSeries(input: {
  schedule: ScheduleRow[];
  payments: PaymentRow[];
  disbursements: DisbursementRow[];
  sanctionedAmount: number;
  startDate: string;
  today: string;
}): BalancePoint[] {
  if (input.schedule.length === 0) return [];
  const dates = new Set(input.schedule.map((row) => row.dueDate));
  for (const row of input.payments) dates.add(row.date);
  for (const row of input.disbursements) dates.add(row.date);
  dates.add(input.today);
  const orderedDates = [...dates].sort();
  return orderedDates.map((date) => {
    const dueRows = input.schedule.filter((row) => row.dueDate <= date);
    const previous = dueRows.at(-1);
    const next = input.schedule.find((row) => row.dueDate > date);
    const projected = previous?.closingBalance ?? next?.openingBalance ?? input.schedule[0]!.openingBalance;
    const disbursed = input.disbursements.length === 0
      ? (date >= input.startDate ? input.sanctionedAmount : 0)
      : input.disbursements.reduce((sum, row) => sum + (row.date <= date ? row.amount : 0), 0);
    const repaid = input.payments.reduce((sum, row) => sum + (row.status === "paid" && row.date <= date ? row.principalPart : 0), 0);
    return {
      date,
      projected,
      actual: date <= input.today ? Math.max(0, disbursed - repaid) : null,
    };
  });
}

function dateTick(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, 1)));
}

export function BalanceOverTimeChart({ loanId }: { loanId: string }) {
  const dataQuery = useQuery({
    queryKey: ["loans", loanId, "balance-series"],
    queryFn: async () => {
      const [loan, schedule, payments, disbursements] = await Promise.all([
        apiRequest<{ sanctionedAmount: number; startDate: string }>(`/api/loans/${loanId}`),
        apiRequest<ScheduleRow[]>(`/api/loans/${loanId}/schedule`),
        apiRequest<PaymentRow[]>(`/api/loans/${loanId}/payments`),
        apiRequest<DisbursementRow[]>(`/api/loans/${loanId}/disbursements`),
      ]);
      return buildBalanceSeries({
        sanctionedAmount: loan.sanctionedAmount,
        startDate: loan.startDate,
        schedule,
        payments,
        disbursements,
        today: new Date().toISOString().slice(0, 10),
      });
    },
  });
  const data = useMemo(() => dataQuery.data ?? [], [dataQuery.data]);

  return (
    <section className="chart-card balance-chart-card" aria-label="Balance over time chart">
      <div className="chart-heading"><div><h2>Balance over time</h2><p>Projected schedule compared with principal paid to date</p></div></div>
      {dataQuery.isPending ? <div className="panel-skeleton" aria-label="Loading balance chart" /> : dataQuery.error ? <div className="notice notice-error" role="alert">Could not load balance history.</div> : data.length === 0 ? <div className="chart-empty">No schedule data is available yet.</div> : (
        <div className="balance-chart" role="img" aria-label="Line chart comparing projected outstanding balance and actual outstanding balance">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 10 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dateTick} tick={{ fill: "var(--muted)", fontSize: 10 }} minTickGap={25} />
              <YAxis tickFormatter={(value: number) => `₹${(value / 100_000).toFixed(0)}L`} tick={{ fill: "var(--muted)", fontSize: 10 }} width={54} />
              <Tooltip
                labelFormatter={(value) => dateTick(String(value))}
                formatter={(value, name) => [value === null ? "—" : formatIndianMoney(asPaise(Number(value))), String(name)]}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}
              />
              <Legend />
              <Line type="monotone" dataKey="projected" name="Projected balance" stroke="#4d71dc" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls />
              <Line type="monotone" dataKey="actual" name="Actual balance" stroke="#42a27f" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
