import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asIsoDate,
  asPaise,
  formatIndianMoney,
  rupeesToPaise,
  simulateRequestSchema,
  type SimulationResult,
  type SimulationScenario,
} from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

interface LoanData {
  annualRatePercent: number;
}
interface SummaryData {
  outstandingPrincipal: number;
  emisRemaining: number;
  nextDueDate: string | null;
}
type ScenarioKind = "prepayment" | "recurring-prepayment" | "rate-change";
type FormValues = {
  kind: ScenarioKind;
  amount: string;
  date: string;
  intervalMonths: string;
  count: string;
  mode: "reduce-tenure" | "reduce-emi";
  rate: string;
  rateMode: "keep-emi" | "keep-tenure";
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day!)));
}

function money(value: number): string {
  return formatIndianMoney(asPaise(value));
}

export function WhatIfSimulator({ loanId }: { loanId: string }) {
  const queryClient = useQueryClient();
  const loanQuery = useQuery({ queryKey: ["loans", loanId], queryFn: () => apiRequest<LoanData>(`/api/loans/${loanId}`) });
  const summaryQuery = useQuery({ queryKey: ["loans", loanId, "summary"], queryFn: () => apiRequest<{ summary: SummaryData }>(`/api/loans/${loanId}/summary`) });
  const [values, setValues] = useState<FormValues>({
    kind: "prepayment", amount: "", date: todayIso(), intervalMonths: "12", count: "2",
    mode: "reduce-tenure", rate: "", rateMode: "keep-emi",
  });
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const simulation = useMutation({
    mutationFn: async (selectedScenario: SimulationScenario) => {
      const loan = loanQuery.data;
      const summary = summaryQuery.data?.summary;
      if (loan === undefined || summary === undefined || summary.nextDueDate === null || summary.outstandingPrincipal <= 0) {
        throw new Error("This loan has no outstanding balance to simulate.");
      }
      const payload = simulateRequestSchema.parse({
        principal: summary.outstandingPrincipal,
        annualRatePercent: loan.annualRatePercent,
        tenureMonths: Math.max(1, summary.emisRemaining),
        firstDueDate: summary.nextDueDate,
        scenario: selectedScenario,
      });
      return apiRequest<SimulationResult>("/api/simulate", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (_result, selectedScenario) => {
      setScenario(selectedScenario);
      setFormError(null);
    },
    onError: (error) => setFormError(error.message),
  });
  const apply = useMutation({
    mutationFn: (selectedScenario: SimulationScenario) => apiRequest<{ applied: number }>(
      `/api/loans/${loanId}/apply-simulation`,
      { method: "POST", body: JSON.stringify(selectedScenario) },
    ),
    onSuccess: async () => {
      setScenario(null);
      simulation.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "timeline"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "entries"] }),
      ]);
    },
    onError: (error) => setFormError(error.message),
  });

  function field<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setScenario(null);
    simulation.reset();
    setFormError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      const selectedScenario: SimulationScenario = values.kind === "rate-change"
        ? {
            type: "rate-change",
            changes: [{ effectiveDate: asIsoDate(values.date), annualRatePercent: Number(values.rate), mode: values.rateMode }],
          }
        : values.kind === "recurring-prepayment"
          ? {
              type: "recurring-prepayment",
              amount: asPaise(rupeesToPaise(values.amount)),
              firstDate: asIsoDate(values.date),
              intervalMonths: Number(values.intervalMonths),
              count: Number(values.count),
              mode: values.mode,
            }
          : {
              type: "prepayment",
              amount: asPaise(rupeesToPaise(values.amount)),
              date: asIsoDate(values.date),
              mode: values.mode,
            };
      simulation.mutate(selectedScenario);
    } catch {
      setFormError("Enter valid dates, amounts, and whole-number intervals.");
    }
  }

  const result = simulation.data;
  return (
    <section className="chart-card what-if-card" aria-label="What-if simulator">
      <div className="chart-heading"><div><h2>What-if simulator</h2><p>Compare a plan before saving it to this loan.</p></div></div>
      <form className="what-if-form" onSubmit={submit} noValidate>
        <label className="form-field" htmlFor="scenario-kind">Scenario<select id="scenario-kind" value={values.kind} onChange={(event) => field("kind", event.target.value as ScenarioKind)}>
          <option value="prepayment">One-time prepayment</option><option value="recurring-prepayment">Recurring prepayment</option><option value="rate-change">Rate change</option>
        </select></label>
        <label className="form-field" htmlFor="scenario-date">{values.kind === "rate-change" ? "Effective date" : values.kind === "recurring-prepayment" ? "First payment date" : "Prepayment date"}<input id="scenario-date" type="date" value={values.date} onChange={(event) => field("date", event.target.value)} required /></label>
        {values.kind !== "rate-change" ? <>
          <label className="form-field" htmlFor="scenario-amount">{values.kind === "recurring-prepayment" ? "Amount each time (₹)" : "Prepayment amount (₹)"}<input id="scenario-amount" inputMode="decimal" value={values.amount} onChange={(event) => field("amount", event.target.value)} required /></label>
          {values.kind === "recurring-prepayment" && <>
            <label className="form-field" htmlFor="scenario-interval">Repeat every (months)<input id="scenario-interval" type="number" min="1" max="1200" step="1" value={values.intervalMonths} onChange={(event) => field("intervalMonths", event.target.value)} /></label>
            <label className="form-field" htmlFor="scenario-count">Number of prepayments<input id="scenario-count" type="number" min="1" max="1200" step="1" value={values.count} onChange={(event) => field("count", event.target.value)} /></label>
          </>}
          <label className="form-field" htmlFor="scenario-mode">Prepayment option<select id="scenario-mode" value={values.mode} onChange={(event) => field("mode", event.target.value as FormValues["mode"])}><option value="reduce-tenure">Reduce tenure</option><option value="reduce-emi">Reduce EMI</option></select></label>
        </> : <>
          <label className="form-field" htmlFor="scenario-rate">New annual rate (%)<input id="scenario-rate" type="number" min="0" max="1000" step="0.01" value={values.rate} onChange={(event) => field("rate", event.target.value)} required /></label>
          <label className="form-field" htmlFor="scenario-rate-mode">Reset option<select id="scenario-rate-mode" value={values.rateMode} onChange={(event) => field("rateMode", event.target.value as FormValues["rateMode"])}><option value="keep-emi">Keep EMI, change tenure</option><option value="keep-tenure">Keep tenure, change EMI</option></select></label>
        </>}
        {formError && <p className="field-error what-if-wide" role="alert">{formError}</p>}
        <div className="what-if-wide what-if-actions"><button className="button button-primary" type="submit" disabled={simulation.isPending || loanQuery.isPending || summaryQuery.isPending}>{simulation.isPending ? "Calculating…" : "Calculate impact"}</button><span>Simulation is not saved until you apply it.</span></div>
      </form>
      {result && scenario && <div className="what-if-results" aria-live="polite">
        <div className="what-if-result-grid"><div><span>Interest without scenario</span><strong>{money(result.baseInterest)}</strong></div><div><span>Interest with scenario</span><strong>{money(result.projectedInterest)}</strong></div><div><span>Interest saved</span><strong>{money(result.interestSaved)}</strong></div><div><span>Months saved</span><strong>{result.monthsSaved}</strong></div><div><span>Projected EMI</span><strong>{money(result.projectedEmi)}</strong></div><div><span>Projected closure</span><strong>{dateLabel(result.projectedClosureDate)}</strong></div></div>
        <button className="button button-primary" type="button" disabled={apply.isPending} onClick={() => apply.mutate(scenario)}>{apply.isPending ? "Applying…" : "Apply this plan"}</button>
      </div>}
      {apply.isSuccess && <p className="notice notice-success" role="status">Scenario applied to the loan.</p>}
    </section>
  );
}
