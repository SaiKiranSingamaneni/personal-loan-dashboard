import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface LoanSummaryData {
  propertyCost: number | null;
  ownContribution: number;
  loanUtilized: number;
  principalDisbursedAsOf: number;
  ownContributionPercent: number | null;
  loanSharePercent: number | null;
  propertyCostRemaining: number | null;
  sanctionedNotDisbursed: number;
  outstandingPrincipal: number;
  principalRepaid: number;
  interestPaidToDate: number;
  emi: number;
  totalInterest: number;
  totalPayable: number;
  interestAsPercentOfPrincipal: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  emisPaid: number;
  emisRemaining: number;
  projectedClosureDate: string | null;
  warnings: string[];
}

interface Props {
  summary: LoanSummaryData;
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : formatIndianMoney(asPaise(value));
}

function formatDate(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

const fundingColors = ["#4d71dc", "#42a27f", "#dce3ee"];

function FundingSplit({ summary }: Props) {
  if (summary.propertyCost === null) {
    return (
      <section className="chart-card funding-card">
        <div className="chart-heading"><div><h2>Property funding</h2><p>Add property cost to see the funding split.</p></div></div>
        <div className="chart-empty">Property funding is not set up for this loan.</div>
      </section>
    );
  }
  const remaining = Math.max(0, summary.propertyCostRemaining ?? 0);
  const data = [
    { name: "Own contribution", amount: Math.max(0, summary.ownContribution) },
    { name: "Loan utilized", amount: Math.max(0, summary.loanUtilized) },
    { name: "Remaining cost", amount: remaining },
  ].filter((item) => item.amount > 0);

  return (
    <section className="chart-card funding-card">
      <div className="chart-heading">
        <div><h2>Property funding</h2><p>How the property cost is covered</p></div>
        <span className="chart-total">{formatMoney(summary.propertyCost)}</span>
      </div>
      {data.length === 0 ? (
        <div className="chart-empty">Add contribution or disbursement amounts to see the split.</div>
      ) : (
        <div className="donut-wrap">
          <div className="donut-chart" role="img" aria-label="Property funding split donut chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={fundingColors[entry.name === "Own contribution" ? 0 : entry.name === "Loan utilized" ? 1 : 2]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatMoney(Number(value ?? 0))}
                  contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)" }}
                />
                <Legend verticalAlign="bottom" height={42} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="funding-amounts">
            <div><span><i className="legend-dot legend-own" /> Own contribution</span><strong>{formatMoney(summary.ownContribution)}</strong></div>
            <div><span><i className="legend-dot legend-loan" /> Loan utilized</span><strong>{formatMoney(summary.loanUtilized)}</strong></div>
            <div><span><i className="legend-dot legend-remaining" /> Remaining cost</span><strong>{formatMoney(summary.propertyCostRemaining)}</strong></div>
          </div>
        </div>
      )}
    </section>
  );
}

function ProgressBars({ summary }: Props) {
  const repaidBase = Math.max(0, summary.principalRepaid + summary.outstandingPrincipal);
  const repaidPercent = percentage(summary.principalRepaid, repaidBase);
  const disbursedPercent = percentage(summary.loanUtilized, summary.loanUtilized + summary.sanctionedNotDisbursed);
  return (
    <section className="chart-card progress-card">
      <div className="chart-heading"><div><h2>Repayment progress</h2><p>Principal paid and loan utilization</p></div></div>
      <div className="progress-block">
        <div className="progress-label"><span>Principal repaid</span><strong>{repaidPercent.toFixed(1)}%</strong></div>
        <div className="progress-track" role="progressbar" aria-label="Principal repaid" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(repaidPercent)}>
          <span className="progress-fill progress-blue" style={{ width: `${repaidPercent}%` }} />
        </div>
        <div className="progress-ends"><span>{formatMoney(summary.principalRepaid)} repaid</span><span>{formatMoney(summary.outstandingPrincipal)} outstanding</span></div>
      </div>
      <div className="progress-block">
        <div className="progress-label"><span>Sanctioned amount utilized</span><strong>{disbursedPercent.toFixed(1)}%</strong></div>
        <div className="progress-track" role="progressbar" aria-label="Loan disbursed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(disbursedPercent)}>
          <span className="progress-fill progress-green" style={{ width: `${disbursedPercent}%` }} />
        </div>
        <div className="progress-ends"><span>{formatMoney(summary.loanUtilized)} utilized</span><span>{formatMoney(summary.sanctionedNotDisbursed)} remaining sanction</span></div>
      </div>
      <div className="repayment-footnote">{summary.emisPaid} EMIs paid · {summary.emisRemaining} remaining</div>
    </section>
  );
}

export function LoanSummaryDashboard({ summary }: Props) {
  const repaid = percentage(
    summary.principalRepaid,
    summary.principalRepaid + Math.max(0, summary.outstandingPrincipal),
  );
  const cards = [
    { label: "Outstanding principal", value: formatMoney(summary.outstandingPrincipal), note: `${repaid.toFixed(1)}% principal repaid`, accent: "blue" },
    { label: "Monthly EMI", value: formatMoney(summary.emi), note: `${summary.emisRemaining} installments remaining`, accent: "green" },
    { label: "Next due", value: formatMoney(summary.nextDueAmount), note: summary.nextDueDate ? formatDate(summary.nextDueDate) : "No upcoming dues", accent: "amber" },
    { label: "Total interest", value: formatMoney(summary.totalInterest), note: `${summary.interestAsPercentOfPrincipal.toFixed(1)}% of principal`, accent: "purple" },
    { label: "Principal repaid", value: formatMoney(summary.principalRepaid), note: `Interest paid ${formatMoney(summary.interestPaidToDate)}`, accent: "teal" },
    { label: "Projected closure", value: formatDate(summary.projectedClosureDate), note: `${summary.emisRemaining} EMIs remaining`, accent: "slate" },
  ];

  return (
    <div className="summary-dashboard">
      {summary.warnings.length > 0 && (
        <div className="summary-warnings" role="status">
          <strong>Funding needs review</strong>
          {summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
      <div className="summary-grid">
        {cards.map((card) => (
          <article className="summary-card" key={card.label}>
            <span className={`summary-icon icon-${card.accent}`} aria-hidden="true">{card.accent === "amber" ? "◷" : card.accent === "green" ? "↗" : card.accent === "purple" ? "%" : card.accent === "teal" ? "✓" : card.accent === "slate" ? "⌁" : "₹"}</span>
            <span className="summary-label">{card.label}</span>
            <strong className="summary-value">{card.value}</strong>
            <span className="summary-note">{card.note}</span>
          </article>
        ))}
      </div>
      <div className="summary-chart-grid">
        <FundingSplit summary={summary} />
        <ProgressBars summary={summary} />
      </div>
    </div>
  );
}
