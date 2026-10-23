import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyPrepayment, asIsoDate, asPaise, formatIndianMoney, type AmortizationPeriod, type PrepaymentMode } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

interface LoanResponse {
  annualRatePercent: number;
}
interface PaymentRecord {
  date: string;
  type: string;
  status: "scheduled" | "paid" | "missed";
  amount: number;
  principalPart: number;
  prepaymentMode: PrepaymentMode | null;
}
interface Comparison {
  withoutInterest: number;
  withInterest: number;
  withoutMonths: number;
  withMonths: number;
  withoutClosure: string | null;
  withClosure: string | null;
  hasPrepayments: boolean;
}

export function calculatePrepaymentImpact(
  schedule: AmortizationPeriod[],
  payments: PaymentRecord[],
  annualRatePercent: number,
): Comparison {
  let projected = [...schedule];
  const prepayments = payments
    .filter((payment) => payment.status === "paid" && (payment.type === "prepayment" || payment.type === "part-payment") && payment.prepaymentMode !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  for (const payment of prepayments) {
    try {
      projected = applyPrepayment(
        projected,
        asPaise(payment.principalPart > 0 ? payment.principalPart : payment.amount),
        asIsoDate(payment.date),
        annualRatePercent,
        payment.prepaymentMode!,
      ).schedule;
    } catch {
      // Historical payments after projected closure cannot change the remaining schedule.
    }
  }
  return {
    withoutInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
    withInterest: projected.reduce((sum, row) => sum + row.interest, 0),
    withoutMonths: schedule.length,
    withMonths: projected.length,
    withoutClosure: schedule.at(-1)?.dueDate ?? null,
    withClosure: projected.at(-1)?.dueDate ?? null,
    hasPrepayments: prepayments.length > 0,
  };
}

function dateLabel(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function PrepaymentImpact({ loanId }: { loanId: string }) {
  const dataQuery = useQuery({
    queryKey: ["loans", loanId, "prepayment-impact"],
    queryFn: async () => {
      const [loan, schedule, payments] = await Promise.all([
        apiRequest<LoanResponse>(`/api/loans/${loanId}`),
        apiRequest<AmortizationPeriod[]>(`/api/loans/${loanId}/schedule`),
        apiRequest<PaymentRecord[]>(`/api/loans/${loanId}/payments`),
      ]);
      return calculatePrepaymentImpact(schedule, payments, loan.annualRatePercent);
    },
  });
  const impact = useMemo(() => dataQuery.data, [dataQuery.data]);

  return (
    <section className="chart-card prepayment-impact-card" aria-label="Prepayment impact comparison">
      <div className="chart-heading"><div><h2>Prepayment impact</h2><p>Recorded paid prepayments compared with the base schedule</p></div></div>
      {dataQuery.isPending ? <div className="panel-skeleton" aria-label="Loading prepayment impact" /> : dataQuery.error ? <div className="notice notice-error" role="alert">Could not calculate prepayment impact.</div> : impact && (
        <>
          {!impact.hasPrepayments && <p className="prepayment-empty">No paid prepayments recorded yet. This comparison will update when one is added.</p>}
          <div className="prepayment-comparison">
            <article className="prepayment-scenario"><span className="prepayment-scenario-label">Without prepayments</span><strong>{formatIndianMoney(asPaise(impact.withoutInterest))}</strong><span>Total scheduled interest</span><div className="prepayment-secondary-metric"><span>Loan term</span><b>{impact.withoutMonths} months</b></div><div className="prepayment-secondary-metric"><span>Projected closure</span><b>{dateLabel(impact.withoutClosure)}</b></div></article>
            <article className="prepayment-scenario scenario-with-prepayments"><span className="prepayment-scenario-label">With prepayments</span><strong>{formatIndianMoney(asPaise(impact.withInterest))}</strong><span>Projected total interest</span><div className="prepayment-secondary-metric"><span>Loan term</span><b>{impact.withMonths} months</b></div><div className="prepayment-secondary-metric"><span>Projected closure</span><b>{dateLabel(impact.withClosure)}</b></div></article>
          </div>
          <div className="prepayment-savings"><div><span>Interest saved</span><strong>{formatIndianMoney(asPaise(Math.max(0, impact.withoutInterest - impact.withInterest)))}</strong></div><div><span>Months saved</span><strong>{Math.max(0, impact.withoutMonths - impact.withMonths)}</strong></div></div>
        </>
      )}
    </section>
  );
}
