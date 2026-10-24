import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface DashboardSummary {
  sanctioned: number;
  disbursed: number;
  undisbursed: number;
  principalRepaid: number;
  outstandingPrincipal: number;
  interestPaid: number;
  nextEmi: { date: string; amount: number } | null;
  totalOutlay: number;
  agreementValue: number;
  extraCosts: number;
  fundingSplit: { loanDisbursed: number; selfBank: number; cash: number; remainingToPay: number };
  warnings: string[];
}
interface PropertyComponent { id: string; name: string; group: "AGREEMENT" | "ADDITIONAL" | "CASH" | "OUTSIDE_AGREEMENT"; kind?: string; amount: number; note?: string | null }
interface ActivityRow { id: string; title: string; date: string; amount: number | null; type: string; notes: string | null }
interface PopupCostItem { id: string; name: string; amount: number; note?: string | null }
interface PropertyCostPopup {
  agreement: { basePrice: PopupCostItem[]; otherCharges: PopupCostItem[]; gst: number; preGstSubtotal: number; grandTotal: number; loan: number; paidByYou: number };
  additional: { items: PopupCostItem[]; subtotal: number; totalBeforeCash: number };
  cash: { items: PopupCostItem[]; subtotal: number };
  finalCost: number;
  whoPays: { id: string; name: string; amount: number; percent: number }[];
  propertyFacts: { superBuiltUpSft: number; ratePerSft: number; parkingSlots: number } | null;
  checkDifferences: number;
}
interface DashboardResponse {
  loan: { id: string; name: string };
  summary: DashboardSummary;
  components: PropertyComponent[];
  recentActivity: ActivityRow[];
  invoiceMismatch: { amount: number; direction: string } | null;
  propertyBreakdown?: { popup: PropertyCostPopup };
}

const agreementColors = ["#286c63", "#418d7d", "#63a99a", "#8bc5b7", "#b2ddd3", "#1f504a"];
const extraColors = ["#bd653e", "#d78a53", "#e6ad79", "#f0c9a5", "#a84e32", "#7d3d2c"];
const loanColors = ["#286c63", "#d78a53", "#5d8290", "#bd653e"];
const info: Record<string, string> = {
  EMI: "Your EMI is the regular monthly payment due on the loan.",
  Principal: "Principal is the amount borrowed, before interest.",
  Disbursed: "Disbursed means the bank has paid this part of the loan out.",
  Sanctioned: "Sanctioned is the maximum amount the bank approved.",
  Outstanding: "Outstanding is the principal you still owe.",
  Interest: "Interest is the extra amount the bank charges for lending you money.",
  "Corpus fund": "A corpus fund is a one-time shared reserve collected by the building or community.",
  "Pre-EMI": "Pre-EMI is interest charged on the amount already paid out before regular installments begin.",
};

function exact(value: number): string { return formatIndianMoney(asPaise(value)); }
function breakdownAmount(value: number): string {
  const formatted = exact(value);
  return value % 100 === 0 ? formatted.replace(/\.00$/, "") : formatted;
}
function compact(value: number): string {
  const rupees = value / 100;
  if (rupees >= 10_000_000) return `Rs ${(rupees / 10_000_000).toFixed(2)} crore`;
  if (rupees >= 100_000) return `Rs ${(rupees / 100_000).toFixed(2)} lakh`;
  return exact(value).replace("₹", "Rs ");
}
function dateLabel(value: string | null): string {
  if (value === null) return "No upcoming EMI";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}
function glossaryTitle(term: string): string | undefined { return info[term]; }
function percent(value: number, total: number): number { return total <= 0 ? 0 : value / total * 100; }
function definitionFor(label: string): string | undefined {
  if (label.includes("EMI")) return glossaryTitle("EMI");
  if (label.includes("Outstanding")) return glossaryTitle("Outstanding");
  if (label.includes("Principal")) return glossaryTitle("Principal");
  if (label.includes("Disbursed")) return glossaryTitle("Disbursed");
  if (label.includes("Sanctioned")) return glossaryTitle("Sanctioned");
  if (label.includes("Interest")) return glossaryTitle("Interest");
  if (label.includes("Corpus fund")) return glossaryTitle("Corpus fund");
  if (label.includes("Pre-EMI")) return glossaryTitle("Pre-EMI");
  return undefined;
}
function propertyGroupHeading(group: string | undefined, previousGroup: string | undefined) {
  if (group === previousGroup) return null;
  return <strong className="beginner-legend-group">{group === "AGREEMENT" ? "Agreement" : group === "OUTSIDE_AGREEMENT" ? "Extra costs outside agreement" : ""}</strong>;
}

function SliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent: fraction, name }: {
  cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number; name?: string;
}) {
  if ((fraction ?? 0) < .05) return null;
  const radius = ((innerRadius ?? 0) + (outerRadius ?? 0)) / 2;
  const radians = -((midAngle ?? 0) * Math.PI) / 180;
  const x = (cx ?? 0) + radius * Math.cos(radians);
  const y = (cy ?? 0) + radius * Math.sin(radians);
  return <text x={x} y={y} fill="white" fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central">{name} {Math.round((fraction ?? 0) * 100)}%</text>;
}

function PiePanel({ title, subtitle, total, data, colors, centreTitle, caption, emptyHref }: {
  title: string; subtitle: string; total: number; data: { id: string; name: string; amount: number; group?: string }[];
  colors: (item: { group?: string }, index: number) => string; centreTitle: string; caption?: string; emptyHref: string;
}) {
  const active = data.filter((item) => item.amount > 0);
  const totalForSlices = active.reduce((sum, item) => sum + item.amount, 0);
  return <section className="beginner-pie-panel">
    <header><div><h2>{title}</h2><p>{subtitle}</p></div><strong title={exact(total)}>{compact(total)}</strong></header>
    {active.length === 0 ? <div className="beginner-chart-empty"><p>Add your property cost to see this chart.</p><Link className="button button-secondary" to={emptyHref}>Add your property cost</Link></div> : <>
      <div className="beginner-pie-visual" role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={active} dataKey="amount" nameKey="name" innerRadius="59%" outerRadius="86%" paddingAngle={1} stroke="var(--surface)" labelLine={false} label={SliceLabel}>
            {active.map((item, index) => <Cell key={item.id} fill={colors(item, index)} />)}
          </Pie>
          <Tooltip content={({ active: isActive, payload }) => {
            const item = payload?.[0]?.payload as typeof active[number] | undefined;
            if (!isActive || item === undefined) return null;
            const share = percent(item.amount, totalForSlices);
            return <div className="beginner-tooltip"><strong>{item.name}</strong><span>{exact(item.amount)} · {share.toFixed(1)}%</span><small>{title === "Property cost" ? `This is part of ${item.group === "AGREEMENT" ? "the builder agreement" : "extra costs outside the agreement"}.` : "This is part of the sanctioned loan amount."}</small></div>;
          }} />
        </PieChart></ResponsiveContainer>
        <div className="beginner-pie-centre"><span title={definitionFor(centreTitle)}>{centreTitle}{definitionFor(centreTitle) && " ⓘ"}</span><strong title={exact(total)}>{compact(total)}</strong></div>
      </div>
      {caption && <p className="beginner-pie-caption">{caption}</p>}
      <div className="beginner-legend-table" role="table" aria-label={`${title} amounts`}>
        {active.map((item, index) => <div className="beginner-legend-fragment" key={item.id}>
          {title === "Property cost" && propertyGroupHeading(item.group, active[index - 1]?.group)}
          <div className="beginner-legend-row" role="row">
            <span className="beginner-legend-name" role="cell" title={definitionFor(item.name)}><i style={{ background: colors(item, index) }} />{item.name}</span>
            <strong role="cell" title={exact(item.amount)}>{compact(item.amount)}</strong>
            <span role="cell">{percent(item.amount, totalForSlices).toFixed(1)}%</span>
          </div>
        </div>)}
      </div>
    </>}
  </section>;
}

export function BeginnerLoanDashboard({ data }: { data: DashboardResponse }) {
  const [propertyMode, setPropertyMode] = useState<"items" | "payers">("items");
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [propertyBreakdownOpen, setPropertyBreakdownOpen] = useState(false);
  const propertyBreakdownRef = useRef<HTMLElement>(null);
  const summary = data.summary;
  const popup = data.propertyBreakdown?.popup;

  useEffect(() => {
    if (!propertyBreakdownOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = propertyBreakdownRef.current;
    const closeButton = dialog?.querySelector<HTMLElement>("[data-dialog-close]");
    closeButton?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPropertyBreakdownOpen(false);
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [propertyBreakdownOpen]);
  const selfPay = summary.fundingSplit.selfBank + summary.fundingSplit.cash;
  const propertySlices = propertyMode === "items"
    ? data.components.map((item) => ({ id: item.id, name: item.name, group: item.group, amount: item.amount }))
    : [
      { id: "loan", name: "Loan", amount: summary.fundingSplit.loanDisbursed },
      { id: "self-bank", name: "Self (bank)", amount: summary.fundingSplit.selfBank },
      { id: "cash", name: "Cash", amount: summary.fundingSplit.cash },
      { id: "still-to-pay", name: "Still to pay", amount: summary.fundingSplit.remainingToPay },
    ];
  const loanSlices = [
    { id: "repaid", name: "Principal repaid", amount: summary.principalRepaid },
    { id: "outstanding", name: "Outstanding principal", amount: summary.outstandingPrincipal },
    { id: "undisbursed", name: "Not yet disbursed", amount: summary.undisbursed },
    { id: "interest", name: "Interest paid", amount: summary.interestPaid },
  ];
  const kpis = [
    ["Total property cost", summary.totalOutlay, "Agreement plus extra costs"],
    ["You pay yourself", selfPay, `${compact(summary.fundingSplit.selfBank)} from bank · ${compact(summary.fundingSplit.cash)} in cash`],
    ["Loan covers", summary.disbursed, `${compact(summary.principalRepaid)} repaid so far`],
    ["Loan still owed", summary.outstandingPrincipal, "Outstanding principal"],
    ["Interest paid so far", summary.interestPaid, "The bank's charge for lending"],
  ] as const;

  return <div className="beginner-dashboard">
    <section className="plain-summary-banner" aria-label="Loan summary">
      <p>You are buying a property that costs <strong title={exact(summary.totalOutlay)}>{compact(summary.totalOutlay)}</strong> in total. <strong title={exact(summary.disbursed)}>{compact(summary.disbursed)}</strong> of it has been paid out by the loan, and you pay <strong title={exact(selfPay)}>{compact(selfPay)}</strong> yourself ({compact(summary.fundingSplit.cash)} in cash). The bank approved <strong title={exact(summary.sanctioned)}>{compact(summary.sanctioned)}</strong> and has paid <strong title={exact(summary.disbursed)}>{compact(summary.disbursed)}</strong> so far. You have repaid <strong title={exact(summary.principalRepaid)}>{compact(summary.principalRepaid)}</strong>, still owe <strong title={exact(summary.outstandingPrincipal)}>{compact(summary.outstandingPrincipal)}</strong>, and have paid <strong title={exact(summary.interestPaid)}>{compact(summary.interestPaid)}</strong> in interest.</p>
      <button className="text-button" type="button" onClick={() => setGlossaryOpen(true)}>What do these terms mean?</button>
    </section>
    {summary.warnings.length > 0 && <div className="summary-warnings" role="status">{summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
    <section className="beginner-kpis" aria-label="Loan summary amounts">
      {kpis.map(([label, value, description]) => <article className="beginner-kpi" key={label}>
        <span className="beginner-kpi-label" title={definitionFor(label)}>{label}{definitionFor(label) && <abbr aria-hidden="true"> ⓘ</abbr>}{label === "Total property cost" && <button className="property-breakdown-trigger" type="button" aria-label="Show property cost breakdown" aria-haspopup="dialog" onClick={() => setPropertyBreakdownOpen(true)}>i</button>}</span><strong title={exact(value)}>{compact(value)}</strong><small>{description}</small>
      </article>)}
      <article className="beginner-kpi"><span>Next EMI <abbr title={glossaryTitle("EMI")}>ⓘ</abbr></span><strong title={summary.nextEmi ? exact(summary.nextEmi.amount) : undefined}>{summary.nextEmi ? compact(summary.nextEmi.amount) : "None"}</strong><small>{dateLabel(summary.nextEmi?.date ?? null)}</small></article>
    </section>
    <div className="beginner-pies">
      <section className="beginner-pie-card">
        <div className="beginner-chart-tabs" role="group" aria-label="Property cost chart grouping">
          <button type="button" aria-pressed={propertyMode === "items"} onClick={() => setPropertyMode("items")}>By cost item</button>
          <button type="button" aria-pressed={propertyMode === "payers"} onClick={() => setPropertyMode("payers")}>By who pays</button>
        </div>
        <PiePanel title="Property cost" subtitle="See how each cost adds up to the total outlay." total={summary.totalOutlay}
          data={propertySlices} centreTitle="Total cost" emptyHref={`/loans/${data.loan.id}/edit`} colors={(item, index) => propertyMode === "payers" ? ["#286c63", "#5d8290", "#bd653e", "#d4d7ce"][index % 4]! : item.group === "OUTSIDE_AGREEMENT" ? extraColors[index % extraColors.length]! : agreementColors[index % agreementColors.length]!} />
        {propertyMode === "items" && <div className="property-cost-subtotals"><span>Agreement value <strong title={exact(summary.agreementValue)}>{compact(summary.agreementValue)}</strong></span><span>Extra costs <strong title={exact(summary.extraCosts)}>{compact(summary.extraCosts)}</strong></span><span>Total <strong title={exact(summary.totalOutlay)}>{compact(summary.totalOutlay)}</strong></span></div>}
        <div className="funding-bar-block"><div><strong>Who pays</strong><small>Funding split against total property cost</small></div>
          <div className="funding-stack" role="img" aria-label={`Loan ${compact(summary.fundingSplit.loanDisbursed)}, self bank ${compact(summary.fundingSplit.selfBank)}, cash ${compact(summary.fundingSplit.cash)}, still to pay ${compact(summary.fundingSplit.remainingToPay)}`}>
            {[[summary.fundingSplit.loanDisbursed, "#286c63", "Loan"], [summary.fundingSplit.selfBank, "#5d8290", "Self bank"], [summary.fundingSplit.cash, "#bd653e", "Cash"], [summary.fundingSplit.remainingToPay, "#d4d7ce", "Still to pay"]].map(([amount, color, name]) => <span key={String(name)} title={`${name}: ${exact(Number(amount))}`} style={{ width: `${percent(Number(amount), summary.totalOutlay)}%`, background: String(color) }} />)}
          </div>
        </div>
      </section>
      <section className="beginner-pie-card">
        <PiePanel title="Your loan" subtitle="Where the approved loan amount stands today." total={summary.sanctioned}
          data={loanSlices} centreTitle="Sanctioned" emptyHref={`/loans/${data.loan.id}/edit`} caption="Interest is an extra cost on top of the loan amount."
          colors={(_item, index) => loanColors[index]!} />
        <div className="beginner-progress-list">
          <Progress label="Disbursed vs sanctioned" value={summary.disbursed} total={summary.sanctioned} color="green" />
          <Progress label="Repaid vs disbursed" value={summary.principalRepaid} total={summary.disbursed} color="copper" />
        </div>
      </section>
    </div>
    <section className="beginner-recent-activity">
      <header><div><h2>Recent activity</h2><p>Your latest recorded loan entries</p></div><Link to="?tab=activity">View all activity</Link></header>
      {data.recentActivity.length === 0 ? <p className="entry-empty">No recent activity recorded.</p> : <ul>{data.recentActivity.slice(0, 5).map((entry) => <li key={entry.id}><div><strong>{entry.title}</strong><small>{entry.date}{entry.notes ? ` · ${entry.notes}` : ""}</small></div><span>{entry.amount === null ? "Rate change" : compact(entry.amount)}</span></li>)}</ul>}
    </section>
    {glossaryOpen && <div className="glossary-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGlossaryOpen(false); }}>
      <aside className="glossary-drawer" role="dialog" aria-modal="true" aria-labelledby="glossary-heading"><header><h2 id="glossary-heading">Loan terms</h2><button type="button" aria-label="Close glossary" onClick={() => setGlossaryOpen(false)}>×</button></header><dl>{Object.entries(info).map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl></aside>
    </div>}
    {propertyBreakdownOpen && <div className="property-breakdown-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPropertyBreakdownOpen(false); }}>
      <section className="property-breakdown-dialog" role="dialog" aria-modal="true" aria-labelledby="property-breakdown-heading" ref={propertyBreakdownRef}>
        <header><div><span className="eyebrow">PROPERTY COST</span><h2 id="property-breakdown-heading">Property cost breakdown</h2></div><button type="button" data-dialog-close className="property-breakdown-close" aria-label="Close property cost breakdown" onClick={() => setPropertyBreakdownOpen(false)}>×</button></header>
        {popup ? <>
          <section className="breakdown-section" aria-labelledby="breakdown-grand-heading">
            <h3 id="breakdown-grand-heading">A. Grand total (incl. GST)</h3>
            <BreakdownRows items={popup.agreement.basePrice} fallbackName="Base price (before GST)" />
            <BreakdownRows items={popup.agreement.otherCharges} />
            <BreakdownLine label="GST" amount={popup.agreement.gst} />
            <BreakdownLine label="Grand total" amount={popup.agreement.grandTotal} strong />
            <div className="breakdown-subline"><span>of which Loan</span><strong>{breakdownAmount(popup.agreement.loan)}</strong></div>
            <div className="breakdown-subline"><span>of which paid by you</span><strong>{breakdownAmount(popup.agreement.paidByYou)}</strong></div>
          </section>
          <section className="breakdown-section" aria-labelledby="breakdown-additional-heading">
            <h3 id="breakdown-additional-heading">B. Additional charges (outside the grand total)</h3>
            <BreakdownRows items={popup.additional.items} emptyText="No additional charges recorded." />
            <BreakdownLine label="Additional charges subtotal" amount={popup.additional.subtotal} />
            <BreakdownLine label="Total before cash" amount={popup.additional.totalBeforeCash} strong />
          </section>
          <section className="breakdown-section" aria-labelledby="breakdown-cash-heading">
            <h3 id="breakdown-cash-heading">C. Cash component</h3>
            <BreakdownRows items={popup.cash.items} fallbackName="Cash component" />
            <BreakdownLine label="Cash total" amount={popup.cash.subtotal} strong />
          </section>
          <div className="breakdown-final-cost"><span>Final cost of the flat</span><strong>{breakdownAmount(popup.finalCost)}</strong></div>
          <section className="breakdown-section breakdown-payers" aria-labelledby="breakdown-payers-heading">
            <h3 id="breakdown-payers-heading">Who pays</h3>
            <table aria-label="Who pays"><thead><tr><th scope="col">Source</th><th scope="col">Amount</th><th scope="col">Share</th></tr></thead><tbody>
              {popup.whoPays.map((item) => <tr key={item.id}><th scope="row">{item.name}</th><td>{breakdownAmount(item.amount)}</td><td>{item.percent.toFixed(1)}%</td></tr>)}
              <tr className="breakdown-table-total"><th scope="row">Final cost</th><td>{breakdownAmount(popup.finalCost)}</td><td>100%</td></tr>
            </tbody></table>
          </section>
          <footer className="property-breakdown-footer">
            {popup.propertyFacts ? <p>Property facts: {new Intl.NumberFormat("en-IN").format(popup.propertyFacts.superBuiltUpSft)} sft super built-up area · {breakdownAmount(popup.propertyFacts.ratePerSft)} per sft · {popup.propertyFacts.parkingSlots} parking slots</p> : <p>Property facts have not been added yet.</p>}
            <p>Cross-check: <Link to={`/loans/${data.loan.id}/edit?tab=details#property-cross-check`} onClick={() => setPropertyBreakdownOpen(false)}>{popup.checkDifferences === 0 ? "All checks match" : `${popup.checkDifferences} ${popup.checkDifferences === 1 ? "difference" : "differences"}`} · view in Loan details</Link></p>
            <Link className="button button-primary" to={`/loans/${data.loan.id}/edit?tab=details`} onClick={() => setPropertyBreakdownOpen(false)}>Edit property details</Link>
          </footer>
        </> : <div className="breakdown-empty"><p>Property breakdown data is not available.</p><Link className="button button-primary" to={`/loans/${data.loan.id}/edit?tab=details`} onClick={() => setPropertyBreakdownOpen(false)}>Edit property details</Link></div>}
        <button type="button" className="button button-secondary breakdown-close-footer" onClick={() => setPropertyBreakdownOpen(false)}>Close</button>
      </section>
    </div>}
  </div>;
}

function BreakdownRows({ items, fallbackName, emptyText }: { items: PopupCostItem[]; fallbackName?: string; emptyText?: string }) {
  if (items.length === 0) return emptyText ? <p className="breakdown-empty-line">{emptyText}</p> : fallbackName ? <BreakdownLine label={fallbackName} amount={0} /> : null;
  return <>{items.map((item) => <BreakdownLine key={item.id} label={item.name} amount={item.amount} note={item.note} />)}</>;
}

function BreakdownLine({ label, amount, note, strong = false }: { label: string; amount: number; note?: string | null; strong?: boolean }) {
  return <div className={`breakdown-line${strong ? " is-strong" : ""}`}><span>{label}{note && <small>{note}</small>}</span><strong>{breakdownAmount(amount)}</strong></div>;
}

function Progress({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const valuePercent = Math.min(100, percent(value, total));
  return <div className="beginner-progress"><div><span title={definitionFor(label)}>{label}{definitionFor(label) && " ⓘ"}</span><strong>{valuePercent.toFixed(1)}%</strong></div><div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(valuePercent)}><span className={`progress-fill progress-${color}`} style={{ width: `${valuePercent}%` }} /></div><small><span title={exact(value)}>{compact(value)}</span> of <span title={exact(total)}>{compact(total)}</span></small></div>;
}
