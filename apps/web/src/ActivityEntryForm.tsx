import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rupeesToPaise } from "@loan-dashboard/shared";
import { apiRequest, ApiClientError } from "./api.js";

export type ActivityEntryType = "SELF_CONTRIBUTION" | "LOAN_DISBURSEMENT" | "EMI" | "EXTRA_EMI" | "RATE_CHANGE";
export interface ActivityFormEntry {
  id: string;
  type: ActivityEntryType;
  origin?: "USER" | "AUTO";
  date: string;
  amount: number | null;
  title: string;
  notes: string | null;
  source?: "BANK" | "CASH" | "OTHER" | null;
  componentId?: string | null;
  trancheLabel?: string | null;
  bankReference?: string | null;
  status?: "PAID" | "MISSED" | "SKIPPED" | "UPCOMING" | null;
  dueDate?: string | null;
  mode?: "REDUCE_TENURE" | "REDUCE_EMI" | null;
  newRatePercent?: number | null;
  effectiveDate?: string | null;
  rateOption?: "KEEP_EMI_CHANGE_TENURE" | "KEEP_TENURE_CHANGE_EMI" | null;
}

interface FormValues {
  type: ActivityEntryType;
  date: string;
  title: string;
  amount: string;
  notes: string;
  source: "BANK" | "CASH" | "OTHER";
  componentId: string;
  trancheLabel: string;
  bankReference: string;
  status: "PAID" | "MISSED" | "SKIPPED";
  mode: "REDUCE_TENURE" | "REDUCE_EMI";
  newRatePercent: string;
  rateOption: "KEEP_EMI_CHANGE_TENURE" | "KEEP_TENURE_CHANGE_EMI";
}

interface PropertyOption { id: string; name: string }

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function initialValues(): FormValues {
  return {
    type: "SELF_CONTRIBUTION", date: todayIso(), title: "", amount: "", notes: "",
    source: "BANK", componentId: "", trancheLabel: "", bankReference: "", status: "PAID",
    mode: "REDUCE_TENURE", newRatePercent: "", rateOption: "KEEP_EMI_CHANGE_TENURE",
  };
}
function amountField(value: number | null): string { return value === null ? "" : (value / 100).toFixed(2); }
function errorText(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Could not save this activity entry.";
}

export function ActivityEntryForm({ loanId, editingEntry = null, onEditComplete }: {
  loanId: string;
  editingEntry?: ActivityFormEntry | null;
  onEditComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const propertyQuery = useQuery({
    queryKey: ["loans", loanId, "property"],
    queryFn: () => apiRequest<{ components: PropertyOption[] }>(`/api/loans/${loanId}/property`),
  });

  useEffect(() => {
    if (editingEntry === null) return;
    setValues({
      ...initialValues(),
      type: editingEntry.type,
      date: editingEntry.date,
      title: editingEntry.title,
      amount: amountField(editingEntry.amount),
      notes: editingEntry.notes ?? "",
      source: editingEntry.source ?? "OTHER",
      componentId: editingEntry.componentId ?? "",
      trancheLabel: editingEntry.trancheLabel ?? "",
      bankReference: editingEntry.bankReference ?? "",
      status: editingEntry.status === "UPCOMING" || editingEntry.status == null ? "PAID" : editingEntry.status,
      mode: editingEntry.mode ?? "REDUCE_TENURE",
      newRatePercent: editingEntry.newRatePercent?.toString() ?? "",
      rateOption: editingEntry.rateOption ?? "KEEP_EMI_CHANGE_TENURE",
    });
    setFormError(null);
    setToast(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }, [editingEntry]);

  const mutation = useMutation({
    mutationFn: async () => {
      const amount = values.amount.trim() === "" ? null : rupeesToPaise(values.amount);
      const common = { date: values.date, title: values.title.trim(), notes: values.notes.trim() || null };
      let payload: Record<string, unknown>;
      switch (values.type) {
        case "SELF_CONTRIBUTION":
          payload = { ...common, type: values.type, amount, source: values.source, componentId: values.componentId || null };
          break;
        case "LOAN_DISBURSEMENT":
          payload = { ...common, type: values.type, amount, trancheLabel: values.trancheLabel.trim() || null, bankReference: values.bankReference.trim() || null };
          break;
        case "EMI":
          payload = { ...common, type: values.type, amount, dueDate: values.date, status: values.status };
          break;
        case "EXTRA_EMI":
          payload = { ...common, type: values.type, amount, mode: values.mode };
          break;
        case "RATE_CHANGE":
          payload = { ...common, type: values.type, effectiveDate: values.date, newRatePercent: Number(values.newRatePercent), rateOption: values.rateOption };
          break;
      }
      return apiRequest<ActivityFormEntry>(editingEntry === null
        ? `/api/loans/${loanId}/activity`
        : `/api/activity/${editingEntry.id}`, {
        method: editingEntry === null ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "activity"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "entries"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "summary"] }),
      ]);
      setToast(editingEntry === null ? "Activity entry added." : "Activity entry updated.");
      setValues(initialValues());
      setFormError(null);
      setSubmitted(false);
      onEditComplete?.();
    },
    onError: (error) => setFormError(errorText(error)),
  });

  const amountInvalid = values.type !== "RATE_CHANGE" && (
    values.amount.trim() === "" || !/^\d+(\.\d{1,2})?$/.test(values.amount) || (() => {
      try { return rupeesToPaise(values.amount) <= 0; } catch { return true; }
    })()
  );
  const dateInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(Date.parse(`${values.date}T00:00:00Z`));
  const titleInvalid = values.title.trim() === "" || values.title.trim().length > 80;
  const rateInvalid = values.type === "RATE_CHANGE" && (!Number.isFinite(Number(values.newRatePercent)) || values.newRatePercent === "" || Number(values.newRatePercent) < 0 || Number(values.newRatePercent) > 1000);
  const formInvalid = dateInvalid || titleInvalid || amountInvalid || rateInvalid || values.notes.length > 1000;

  function update<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
    setToast(null);
  }

  function cancelEdit() {
    setValues(initialValues());
    setFormError(null);
    setToast(null);
    setSubmitted(false);
    onEditComplete?.();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setToast(null);
    setFormError(null);
    if (formInvalid) return;
    mutation.mutate();
  }

  const label = {
    SELF_CONTRIBUTION: "Self contribution", LOAN_DISBURSEMENT: "Loan disbursement",
    EMI: "EMI", EXTRA_EMI: "Extra EMI", RATE_CHANGE: "Interest rate change",
  }[values.type];

  return <section className={`activity-entry-form${editingEntry ? " is-editing" : ""}`} ref={formRef} aria-labelledby="activity-form-heading">
    <header><div><span className="entry-form-kicker">ACTIVITY</span><h2 id="activity-form-heading">{editingEntry ? `Editing: ${editingEntry.title}` : "Add an activity entry"}</h2><p>{editingEntry?.origin === "AUTO" ? "Saving changes keeps this installment as your own record." : "Record the money movement or loan change."}</p></div></header>
    <form onSubmit={submit} noValidate>
      <div className="activity-form-fields">
        <label className="form-field" htmlFor="activity-type">Entry type<select id="activity-type" value={values.type} disabled={editingEntry !== null} onChange={(event) => { update("type", event.target.value as ActivityEntryType); setSubmitted(false); }}>
          <option value="SELF_CONTRIBUTION">Self contribution</option><option value="LOAN_DISBURSEMENT">Loan disbursement</option><option value="EMI">EMI</option><option value="EXTRA_EMI">Extra EMI</option><option value="RATE_CHANGE">Rate change</option>
        </select></label>
        <label className="form-field" htmlFor="activity-date">Date<input id="activity-date" type="date" value={values.date} onChange={(event) => update("date", event.target.value)} aria-invalid={submitted && dateInvalid} required />{submitted && dateInvalid && <small className="field-error">Enter a valid date.</small>}</label>
        <label className="form-field activity-form-title" htmlFor="activity-title">Title<input id="activity-title" maxLength={80} value={values.title} onChange={(event) => update("title", event.target.value)} aria-invalid={submitted && titleInvalid} required /><small>{values.title.length}/80</small>{submitted && titleInvalid && <small className="field-error">Enter a title up to 80 characters.</small>}</label>
        {values.type !== "RATE_CHANGE" && <label className="form-field" htmlFor="activity-amount">Amount (Rs)<input id="activity-amount" inputMode="decimal" value={values.amount} onChange={(event) => update("amount", event.target.value)} aria-invalid={submitted && amountInvalid} required />{submitted && amountInvalid && <small className="field-error">Enter an amount greater than zero with up to two decimal places.</small>}</label>}
        {values.type === "SELF_CONTRIBUTION" && <>
          <label className="form-field" htmlFor="contribution-source">Paid from<select id="contribution-source" value={values.source} onChange={(event) => update("source", event.target.value as FormValues["source"])}><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label>
          <label className="form-field" htmlFor="contribution-component">Property cost item (optional)<select id="contribution-component" value={values.componentId} onChange={(event) => update("componentId", event.target.value)}><option value="">Not linked</option>{(propertyQuery.data?.components ?? []).map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}</select></label>
        </>}
        {values.type === "LOAN_DISBURSEMENT" && <>
          <label className="form-field" htmlFor="tranche-label">Tranche label (optional)<input id="tranche-label" maxLength={80} value={values.trancheLabel} onChange={(event) => update("trancheLabel", event.target.value)} /></label>
          <label className="form-field" htmlFor="bank-reference">Bank reference (optional)<input id="bank-reference" maxLength={120} value={values.bankReference} onChange={(event) => update("bankReference", event.target.value)} /></label>
        </>}
        {values.type === "EMI" && <label className="form-field" htmlFor="emi-status">Status<select id="emi-status" value={values.status} onChange={(event) => update("status", event.target.value as FormValues["status"])}><option value="PAID">Paid</option><option value="MISSED">Missed</option><option value="SKIPPED">Skipped</option></select></label>}
        {values.type === "EXTRA_EMI" && <label className="form-field" htmlFor="extra-emi-mode">Apply to<select id="extra-emi-mode" value={values.mode} onChange={(event) => update("mode", event.target.value as FormValues["mode"])}><option value="REDUCE_TENURE">Reduce tenure</option><option value="REDUCE_EMI">Reduce EMI</option></select></label>}
        {values.type === "RATE_CHANGE" && <>
          <label className="form-field" htmlFor="new-annual-rate">New annual rate (%)<input id="new-annual-rate" type="number" min="0" max="1000" step="0.01" value={values.newRatePercent} onChange={(event) => update("newRatePercent", event.target.value)} aria-invalid={submitted && rateInvalid} required />{submitted && rateInvalid && <small className="field-error">Enter a rate from 0 to 1000.</small>}</label>
          <label className="form-field" htmlFor="rate-change-option">Repayment option<select id="rate-change-option" value={values.rateOption} onChange={(event) => update("rateOption", event.target.value as FormValues["rateOption"])}><option value="KEEP_EMI_CHANGE_TENURE">Keep EMI, change tenure</option><option value="KEEP_TENURE_CHANGE_EMI">Keep tenure, change EMI</option></select></label>
        </>}
        <label className="form-field activity-form-notes" htmlFor="activity-notes">Transaction notes (optional)<textarea id="activity-notes" rows={2} maxLength={1000} value={values.notes} onChange={(event) => update("notes", event.target.value)} />{values.notes.length > 1000 && <small className="field-error">Notes must be 1000 characters or fewer.</small>}</label>
      </div>
      {formError && <p className="field-error" role="alert">{formError}</p>}
      {toast && <p className="activity-toast" role="status">{toast}</p>}
      <div className="activity-form-actions">
        <button className="button button-primary" type="submit" disabled={mutation.isPending || (submitted && formInvalid)}>{mutation.isPending ? "Saving…" : editingEntry ? "Update entry" : `Add ${label.toLowerCase()}`}</button>
        {editingEntry && <button className="button button-secondary" type="button" onClick={cancelEdit}>Cancel</button>}
      </div>
    </form>
  </section>;
}