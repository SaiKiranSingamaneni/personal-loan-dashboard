import { useState } from "react";
import { z } from "zod";
import { asIsoDate, asPaise, calculateEmi, createAmortizationSchedule, formatIndianMoney, rupeesToPaise } from "@loan-dashboard/shared";

const calculatorSchema = z.object({
  amount: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid loan amount."),
  rate: z.string().trim().regex(/^\d+(?:\.\d{1,4})?$/, "Enter a valid annual rate.").refine((value) => Number(value) <= 1000, "Rate must be 1000% or less."),
  tenure: z.string().trim().regex(/^\d+$/, "Enter tenure in whole months.").refine((value) => Number(value) >= 1 && Number(value) <= 1200, "Tenure must be from 1 to 1200 months."),
});

interface CalculatorValues {
  amount: string;
  rate: string;
  tenure: string;
}

export function EmiCalculatorPage() {
  const [values, setValues] = useState<CalculatorValues>({ amount: "5000000", rate: "8.5", tenure: "240" });
  const [result, setResult] = useState<{ emi: number; totalInterest: number; totalPayable: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<Key extends keyof CalculatorValues>(key: Key, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setResult(null);
    setError(null);
  }

  function calculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = calculatorSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the calculator inputs.");
      setResult(null);
      return;
    }
    try {
      const principal = asPaise(rupeesToPaise(parsed.data.amount));
      const rate = Number(parsed.data.rate);
      const months = Number(parsed.data.tenure);
      const schedule = createAmortizationSchedule({
        principal,
        annualRatePercent: rate,
        tenureMonths: months,
        firstDueDate: asIsoDate("2026-02-05"),
      });
      setResult({
        emi: calculateEmi(principal, rate, months),
        totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0),
        totalPayable: schedule.reduce((sum, row) => sum + row.emi, 0),
      });
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "Could not calculate this schedule.");
    }
  }

  return (
    <div className="emi-calculator-page">
      <div className="page-heading"><div><div className="eyebrow">PLANNING TOOL</div><h1>EMI calculator</h1><p>Estimate a reducing-balance EMI from amount, annual rate, and tenure.</p></div></div>
      <div className="emi-calculator-layout">
        <form className="chart-card emi-calculator-form" onSubmit={calculate} noValidate>
          <label className="form-field" htmlFor="calculator-amount">Loan amount (₹)<input id="calculator-amount" inputMode="decimal" value={values.amount} onChange={(event) => update("amount", event.target.value)} /></label>
          <label className="form-field" htmlFor="calculator-rate">Annual interest rate (%)<input id="calculator-rate" type="number" min="0" max="1000" step="0.01" value={values.rate} onChange={(event) => update("rate", event.target.value)} /></label>
          <label className="form-field" htmlFor="calculator-tenure">Tenure (months)<input id="calculator-tenure" type="number" min="1" max="1200" step="1" value={values.tenure} onChange={(event) => update("tenure", event.target.value)} /></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit">Calculate EMI</button>
        </form>
        {result ? <section className="chart-card emi-calculator-result" aria-live="polite"><div className="eyebrow">ESTIMATED REPAYMENT</div><span className="emi-result-label">Monthly EMI</span><strong className="emi-result-value">{formatIndianMoney(asPaise(result.emi))}</strong><div className="emi-result-row"><span>Total interest</span><strong>{formatIndianMoney(asPaise(result.totalInterest))}</strong></div><div className="emi-result-row"><span>Total payable</span><strong>{formatIndianMoney(asPaise(result.totalPayable))}</strong></div></section> : <section className="chart-card emi-calculator-result calculator-hint"><span>Enter values and calculate to see the estimated EMI and total interest.</span></section>}
      </div>
    </div>
  );
}
