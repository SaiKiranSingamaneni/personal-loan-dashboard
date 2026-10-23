import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  asPaise,
  asIsoDate,
  addMonths,
  calculateEmi,
  createAmortizationSchedule,
  createScheduleWithFixedEmi,
  formatIndianMoney,
  rupeesToPaise,
} from "@loan-dashboard/shared";
import { apiRequest, ApiClientError } from "./api.js";
import { PropertyCostEditor } from "./PropertyCostEditor.js";
import {
  emptyLoanFormValues,
  loanFormSchema,
  type LoanFormValues,
} from "./loanFormSchema.js";

interface LoanRecord {
  id: string;
  name: string;
  lender: string;
  loanType: LoanFormValues["loanType"];
  accountReference: string | null;
  status: LoanFormValues["status"];
  sanctionedAmount: number;
  annualRatePercent: number;
  rateType: LoanFormValues["rateType"];
  tenureMonths: number;
  startDate: string;
  emiDueDay: number;
  emiBasis: LoanFormValues["emiBasis"];
  preEmiInterestOnly: boolean;
  interestMethod: LoanFormValues["interestMethod"];
  emiOverride: number | null;
  processingFee: number | null;
  otherCharges: number | null;
  propertyCost: number | null;
  emiStartRule: LoanFormValues["emiStartRule"];
  emiStartDate: string | null;
}

interface FundingRow {
  amount: number;
}

interface DerivedValues {
  emi: string;
  totalInterest: string;
  totalPayable: string;
  interestPercent: string;
  ownPercent: string;
  loanPercent: string;
  remaining: string;
  undisbursed: string;
  warnings: string[];
}

function amountString(paise: number | null): string {
  if (paise === null) return "";
  const absolute = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${(absolute % 100)
    .toString()
    .padStart(2, "0")}`;
}

function optionalPaise(value: string): number | null {
  return value === "" ? null : rupeesToPaise(value);
}

function dueDateFrom(startDate: string, dueDayText: string) {
  const nextMonth = addMonths(asIsoDate(startDate), 1);
  const [year, month] = nextMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const dueDay = Number(dueDayText);
  return asIsoDate(`${nextMonth.slice(0, 7)}-${Math.min(dueDay, lastDay).toString().padStart(2, "0")}`);
}

function calculateDerived(values: LoanFormValues): DerivedValues {
  const warnings: string[] = [];
  let emi = "—";
  let totalInterest = "—";
  let totalPayable = "—";
  let interestPercent = "—";
  let sanctioned = 0;
  let own = 0;
  let utilized = 0;
  let cost = 0;
  try {
    sanctioned = rupeesToPaise(values.sanctionedAmount);
    own = values.initialOwnContribution === "" ? 0 : rupeesToPaise(values.initialOwnContribution);
    utilized = values.initialLoanUtilized === "" ? 0 : rupeesToPaise(values.initialLoanUtilized);
    cost = values.propertyCost === "" ? 0 : rupeesToPaise(values.propertyCost);
    const rate = Number(values.annualRatePercent);
    const months = Number(values.tenureMonths);
    const emiPrincipal = values.emiBasis === "SANCTIONED" || utilized === 0 ? sanctioned : utilized;
    if (emiPrincipal > 0 && Number.isFinite(rate) && Number.isInteger(months) && months > 0) {
      const calculatedEmi = calculateEmi(asPaise(emiPrincipal), rate, months);
      const override = values.emiOverride === "" ? null : rupeesToPaise(values.emiOverride);
      const schedule = override === null
        ? createAmortizationSchedule({
            principal: asPaise(emiPrincipal),
            annualRatePercent: rate,
            tenureMonths: months,
            firstDueDate: dueDateFrom(values.startDate, values.emiDueDay),
          })
        : createScheduleWithFixedEmi(
            asPaise(emiPrincipal),
            rate,
            asPaise(override),
            1200,
            dueDateFrom(values.startDate, values.emiDueDay),
          );
      const emiValue = override ?? calculatedEmi;
      const interest = schedule.reduce((sum, row) => sum + row.interest, 0);
      const payable = schedule.reduce((sum, row) => sum + row.emi, 0);
      emi = formatIndianMoney(asPaise(emiValue));
      totalInterest = formatIndianMoney(asPaise(interest));
      totalPayable = formatIndianMoney(asPaise(payable));
      interestPercent = `${((interest / emiPrincipal) * 100).toFixed(1)}%`;
    }
  } catch {
    // Inline field validation explains incomplete or invalid values while typing.
  }

  if (cost > 0 && own + utilized > cost) {
    warnings.push("Own contribution and loan utilized exceed the property cost.");
  }
  if (sanctioned > 0 && utilized > sanctioned) {
    warnings.push("Loan utilized exceeds the sanctioned amount.");
  }
  return {
    emi,
    totalInterest,
    totalPayable,
    interestPercent,
    ownPercent: cost > 0 ? `${((own / cost) * 100).toFixed(1)}%` : "—",
    loanPercent: cost > 0 ? `${((utilized / cost) * 100).toFixed(1)}%` : "—",
    remaining: cost > 0 ? formatIndianMoney(asPaise(cost - own - utilized)) : "—",
    undisbursed: sanctioned > 0 ? formatIndianMoney(asPaise(Math.max(0, sanctioned - utilized))) : "—",
    warnings,
  };
}

function toPayload(values: LoanFormValues) {
  return {
    name: values.name.trim(),
    lender: values.lender.trim(),
    loanType: values.loanType,
    accountReference: values.accountReference.trim() || null,
    status: values.status,
    sanctionedAmount: rupeesToPaise(values.sanctionedAmount),
    annualRatePercent: Number(values.annualRatePercent),
    rateType: values.rateType,
    tenureMonths: Number(values.tenureMonths),
    startDate: values.startDate,
    emiDueDay: Number(values.emiDueDay),
    emiBasis: values.emiBasis,
    preEmiInterestOnly: values.preEmiInterestOnly,
    interestMethod: values.interestMethod,
    emiOverride: optionalPaise(values.emiOverride),
    processingFee: optionalPaise(values.processingFee),
    otherCharges: optionalPaise(values.otherCharges),
    propertyCost: optionalPaise(values.propertyCost),
    initialOwnContribution:
      values.initialOwnContribution === "" ? 0 : rupeesToPaise(values.initialOwnContribution),
    initialLoanUtilized:
      values.initialLoanUtilized === "" ? 0 : rupeesToPaise(values.initialLoanUtilized),
    emiStartRule: values.emiStartRule,
    emiStartDate: values.emiStartRule === "date" ? values.emiStartDate : null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Could not save this loan.";
}

export function LoanFormPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { loanId } = useParams();
  const isEditing = loanId !== undefined && loanId !== "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const loanQuery = useQuery({
    queryKey: ["loans", loanId],
    queryFn: () => apiRequest<LoanRecord>(`/api/loans/${loanId}`),
    enabled: isEditing,
  });
  const contributionsQuery = useQuery({
    queryKey: ["loans", loanId, "contributions"],
    queryFn: () => apiRequest<FundingRow[]>(`/api/loans/${loanId}/contributions`),
    enabled: isEditing,
  });
  const disbursementsQuery = useQuery({
    queryKey: ["loans", loanId, "disbursements"],
    queryFn: () => apiRequest<FundingRow[]>(`/api/loans/${loanId}/disbursements`),
    enabled: isEditing,
  });
  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanFormSchema),
    defaultValues: emptyLoanFormValues,
  });
  const { reset } = form;
  const values = form.watch();
  const derived = useMemo(() => calculateDerived(values), [values]);
  const sanctionedPaise = values.sanctionedAmount === "" ? 0 : Number(values.sanctionedAmount.replaceAll(",", "")) * 100;
  const disbursedPaise = values.initialLoanUtilized === "" ? 0 : Number(values.initialLoanUtilized.replaceAll(",", "")) * 100;
  const showEmiBasis = sanctionedPaise > disbursedPaise;

  useEffect(() => {
    if (
      isEditing &&
      loanQuery.data !== undefined &&
      contributionsQuery.data !== undefined &&
      disbursementsQuery.data !== undefined
    ) {
      const loan = loanQuery.data;
      reset({
        name: loan.name,
        lender: loan.lender,
        loanType: loan.loanType,
        accountReference: loan.accountReference ?? "",
        status: loan.status,
        sanctionedAmount: amountString(loan.sanctionedAmount),
        annualRatePercent: loan.annualRatePercent.toString(),
        rateType: loan.rateType,
        tenureMonths: loan.tenureMonths.toString(),
        startDate: loan.startDate,
        emiDueDay: loan.emiDueDay.toString(),
        emiBasis: loan.emiBasis,
        preEmiInterestOnly: loan.preEmiInterestOnly,
        interestMethod: loan.interestMethod,
        emiOverride: amountString(loan.emiOverride),
        processingFee: amountString(loan.processingFee),
        otherCharges: amountString(loan.otherCharges),
        propertyCost: amountString(loan.propertyCost),
        initialOwnContribution: amountString(
          contributionsQuery.data.reduce((sum, item) => sum + item.amount, 0),
        ),
        initialLoanUtilized: amountString(
          disbursementsQuery.data.reduce((sum, item) => sum + item.amount, 0),
        ),
        emiStartRule: loan.emiStartRule,
        emiStartDate: loan.emiStartDate ?? "",
      });
    }
  }, [
    contributionsQuery.data,
    disbursementsQuery.data,
    isEditing,
    loanQuery.data,
    reset,
  ]);

  const mutation = useMutation({
    mutationFn: async (nextValues: LoanFormValues) => {
      const payload = toPayload(nextValues);
      return isEditing
        ? apiRequest<LoanRecord>(`/api/loans/${loanId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : apiRequest<LoanRecord>("/api/loans", {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: async (loan) => {
      await queryClient.invalidateQueries({ queryKey: ["loans"] });
      navigate(`/loans/${loan.id}?tab=${searchParams.get("tab") ?? (isEditing ? "details" : "dashboard")}`);
    },
  });

  if (isEditing && (loanQuery.isPending || contributionsQuery.isPending || disbursementsQuery.isPending)) {
    return <div className="panel-skeleton" aria-label="Loading loan details" />;
  }
  if (isEditing && (loanQuery.error || contributionsQuery.error || disbursementsQuery.error)) {
    return <div className="notice notice-error" role="alert">Could not load loan details for editing.</div>;
  }

  function fieldError(name: keyof LoanFormValues): string | undefined {
    const message = form.formState.errors[name]?.message;
    return typeof message === "string" ? message : undefined;
  }

  function field(name: keyof LoanFormValues, label: string, options: { required?: boolean; type?: string; placeholder?: string; inputMode?: "decimal" | "numeric"; hint?: string } = {}) {
    const error = fieldError(name);
    return (
      <label className="form-field" htmlFor={name}>
        <span>{label}{options.required && <span className="required-mark"> *</span>}</span>
        <input
          id={name}
          type={options.type ?? "text"}
          placeholder={options.placeholder}
          inputMode={options.inputMode}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${name}-error`}
          {...form.register(name)}
        />
        {options.hint && <small>{options.hint}</small>}
        {error && <small id={`${name}-error`} className="field-error">{error}</small>}
      </label>
    );
  }

  function select(name: "loanType" | "rateType" | "status" | "emiStartRule" | "emiBasis" | "interestMethod", label: string, choices: readonly [string, string][]) {
    const error = fieldError(name);
    return (
      <label className="form-field" htmlFor={name}>
        <span>{label}</span>
        <select id={name} aria-invalid={error !== undefined} {...form.register(name)}>
          {choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        {error && <small className="field-error">{error}</small>}
      </label>
    );
  }

  const onSubmit = form.handleSubmit((nextValues) => mutation.mutate(nextValues));
  const formErrors = Object.values(form.formState.errors).length;

  return (
    <section className="loan-form-page">
      {!embedded && <div className="form-page-heading">
        <div>
          <Link className="back-link" to={isEditing ? `/loans/${loanId}?tab=dashboard` : "/"}>← Back to loans</Link>
          <div className="eyebrow">LOAN SETUP</div>
          <h1>{isEditing ? "Loan details" : "Add a loan"}</h1>
          <p>Enter the loan and property funding details. Money is saved in paise.</p>
        </div>
        {isEditing && <span className="status-pill">Editing</span>}
      </div>}

      {!embedded && isEditing && <nav className="tabs loan-edit-tabs" role="tablist" aria-label="Loan sections">
        {[["dashboard", "Dashboard"], ["activity", "Activity"], ["analysis", "Analysis"], ["details", "Loan details"]].map(([value, label]) => <Link
          key={value}
          role="tab"
          aria-selected={value === (searchParams.get("tab") ?? "details")}
          className={`tab${value === (searchParams.get("tab") ?? "details") ? " is-selected" : ""}`}
          to={value === "details" ? `/loans/${loanId}/edit?tab=details` : `/loans/${loanId}?tab=${value}`}
        >{label}</Link>)}
      </nav>}

      <div className="derived-strip" aria-live="polite">
        <div><span>Estimated EMI</span><strong>{derived.emi}</strong></div>
        <div><span>Total interest</span><strong>{derived.totalInterest}</strong></div>
        <div><span>Total payable</span><strong>{derived.totalPayable}</strong></div>
        <div><span>Interest / principal</span><strong>{derived.interestPercent}</strong></div>
      </div>

      <form className="loan-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <fieldset className="form-section">
          <legend><span className="section-number">01</span> Loan details</legend>
          <div className="form-grid">
            {field("name", "Loan name", { required: true, placeholder: "e.g. Apartment loan" })}
            {field("lender", "Lender", { required: true, placeholder: "Bank or lender" })}
            {select("loanType", "Loan type", [["home", "Home"], ["plot", "Plot"], ["vehicle", "Vehicle"], ["personal", "Personal"], ["other", "Other"]])}
            {field("accountReference", "Account / reference number", { placeholder: "Optional" })}
            {field("sanctionedAmount", "Sanctioned amount", { required: true, inputMode: "decimal", placeholder: "₹ 0.00" })}
            {field("annualRatePercent", "Annual interest rate", { required: true, inputMode: "decimal", placeholder: "8.5" })}
            {select("rateType", "Rate type", [["fixed", "Fixed"], ["floating", "Floating"]])}
            {field("tenureMonths", "Tenure (months)", { required: true, inputMode: "numeric", placeholder: "240" })}
            {field("startDate", "Loan start date", { required: true, type: "date" })}
            {field("emiDueDay", "EMI due day", { required: true, inputMode: "numeric", placeholder: "5" })}
            {select("interestMethod", "Interest calculation", [["DAILY", "Daily (actual days / 365)"], ["MONTHLY", "Monthly"]])}
            {field("emiOverride", "Manual EMI override", { inputMode: "decimal", placeholder: "Leave blank to calculate" })}
            {select("status", "Loan status", [["active", "Active"], ["closed", "Closed"]])}
            {field("processingFee", "Processing fee", { inputMode: "decimal", placeholder: "Optional" })}
            {field("otherCharges", "Other upfront charges", { inputMode: "decimal", placeholder: "Optional" })}
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend><span className="section-number">02</span> Property funding <span className="optional-label">Optional</span></legend>
          <p className="section-help">Record what you paid and how much of the sanctioned loan has been used.</p>
          <div className="form-grid">
            {!isEditing && field("propertyCost", "Total property cost", { inputMode: "decimal", placeholder: "₹ 0.00" })}
            {field("initialOwnContribution", isEditing ? "Total own contribution" : "Paid from own funds", { inputMode: "decimal", placeholder: "₹ 0.00" })}
            {field("initialLoanUtilized", isEditing ? "Total loan utilized" : "Loan amount utilized", { inputMode: "decimal", placeholder: "₹ 0.00" })}
          </div>
          <div className="funding-derived">
            <div><span>Own contribution</span><strong>{derived.ownPercent}</strong></div>
            <div><span>Loan share</span><strong>{derived.loanPercent}</strong></div>
            <div><span>Property cost remaining</span><strong>{derived.remaining}</strong></div>
            <div><span>Sanctioned but not utilized</span><strong>{derived.undisbursed}</strong></div>
          </div>
          {derived.warnings.length > 0 && (
            <ul className="form-warnings" role="status">
              {derived.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </fieldset>

        <fieldset className="form-section">
          <legend><span className="section-number">03</span> EMI start rule</legend>
          <div className="form-grid">
            {showEmiBasis && <label className="form-field" htmlFor="emiBasis"><span>Is your EMI calculated on the sanctioned amount or on the disbursed amount?</span><select id="emiBasis" {...form.register("emiBasis")}><option value="SANCTIONED">Sanctioned amount — EMI fixed on full amount from the start</option><option value="DISBURSED">Disbursed amount — EMI recalculated after each disbursement</option></select></label>}
            {showEmiBasis && <label className="form-field checkbox-field"><input type="checkbox" {...form.register("preEmiInterestOnly")} /><span>Before final disbursement, collect interest only</span></label>}
            {select("emiStartRule", "EMI begins", [["full-disbursement", "After full disbursement"], ["date", "On a set date"]])}
            {values.emiStartRule === "date" && field("emiStartDate", "EMI start date", { required: true, type: "date" })}
          </div>
          <p className="section-help">Pre-EMI interest is calculated only on funds already disbursed.</p>
        </fieldset>

        {mutation.error && <div className="notice notice-error" role="alert">{errorMessage(mutation.error)}</div>}
        {formErrors > 0 && form.formState.isSubmitted && <p className="field-error form-summary-error">Review the highlighted fields before saving.</p>}
        <div className="form-actions">
          <Link className="button button-secondary" to={isEditing ? `/loans/${loanId}?tab=${searchParams.get("tab") ?? "details"}` : "/"}>Cancel</Link>
          <button className="button button-primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEditing ? "Save changes" : "Save loan"}
          </button>
        </div>
      </form>
      {isEditing && loanId !== undefined && <PropertyCostEditor loanId={loanId} />}
    </section>
  );
}
