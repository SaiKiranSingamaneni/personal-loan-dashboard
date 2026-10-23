import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asPaise,
  contributionCreateSchema,
  disbursementCreateSchema,
  formatIndianMoney,
  noteCreateSchema,
  paymentCreateSchema,
  rateChangeCreateSchema,
  rupeesToPaise,
} from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

type EntryType = "payment" | "disbursement" | "contribution" | "rate-change" | "note";
type EntryRecord = Record<string, unknown> & {
  id: string;
  loanId: string;
  date?: string;
  effectiveDate?: string;
  amount?: number;
  type?: string;
  principalPart?: number;
  interestPart?: number;
  status?: string;
  note?: string | null;
  text?: string;
  annualRatePercent?: number;
  mode?: string;
};

const entryTypes: { value: EntryType; label: string; route: string }[] = [
  { value: "payment", label: "Payment", route: "payments" },
  { value: "disbursement", label: "Disbursement", route: "disbursements" },
  { value: "contribution", label: "Own contribution", route: "contributions" },
  { value: "rate-change", label: "Rate change", route: "rate-changes" },
  { value: "note", label: "Note", route: "notes" },
];

interface FormValues {
  date: string;
  amount: string;
  paymentType: "emi" | "prepayment" | "part-payment" | "fee" | "other";
  principalPart: string;
  interestPart: string;
  status: "scheduled" | "paid" | "missed";
  prepaymentMode: "reduce-tenure" | "reduce-emi";
  note: string;
  annualRatePercent: string;
  rateMode: "keep-emi" | "keep-tenure";
  text: string;
  paymentId: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function moneyInput(value: unknown): string {
  return typeof value === "number" ? (value / 100).toFixed(2) : "";
}

function initialValues(): FormValues {
  return {
    date: todayIso(), amount: "", paymentType: "emi", principalPart: "", interestPart: "",
    status: "paid", prepaymentMode: "reduce-tenure", note: "", annualRatePercent: "",
    rateMode: "keep-emi", text: "", paymentId: "",
  };
}

function entryDate(entry: EntryRecord): string {
  return entry.date ?? entry.effectiveDate ?? "";
}

function entryTitle(entry: EntryRecord, entryType: EntryType): string {
  if (entryType === "payment") return `${String(entry.type)} · ${String(entry.status)}`;
  if (entryType === "rate-change") return `${String(entry.annualRatePercent)}% · ${String(entry.mode)}`;
  if (entryType === "note") return String(entry.text);
  return entryType === "disbursement" ? "Loan disbursement" : "Own contribution";
}

function cents(value: string): number {
  return value.trim() === "" ? 0 : rupeesToPaise(value);
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function paymentEntriesCsv(rows: readonly Pick<EntryRecord, "date" | "amount" | "type" | "principalPart" | "interestPart" | "status" | "note">[]): string {
  const header = ["Date", "Type", "Amount (INR)", "Principal (INR)", "Interest (INR)", "Status", "Note"];
  const lines = rows.map((row) => [
    row.date ?? "", row.type ?? "", ((row.amount ?? 0) / 100).toFixed(2),
    ((row.principalPart ?? 0) / 100).toFixed(2), ((row.interestPart ?? 0) / 100).toFixed(2),
    row.status ?? "", row.note ?? "",
  ]);
  return [header, ...lines].map((line) => line.map(csvField).join(",")).join("\r\n");
}

export function LoanEntries({ loanId }: { loanId: string }) {
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<EntryType>("payment");
  const [editing, setEditing] = useState<EntryRecord | null>(null);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [formError, setFormError] = useState<string | null>(null);
  const itemType = entryTypes.find((item) => item.value === entryType)!;
  const listQueries = useQuery({
    queryKey: ["loans", loanId, "entries"],
    queryFn: async () => {
      await apiRequest<{ created: number; updated: number; total: number }>(
        `/api/loans/${loanId}/payments/generate-scheduled`,
        { method: "POST", body: "{}" },
      );
      const results = await Promise.all(entryTypes.map(async (item) => ({
        type: item.value,
        records: await apiRequest<EntryRecord[]>(`/api/loans/${loanId}/${item.route}`),
      })));
      void queryClient.invalidateQueries({ queryKey: ["loans", loanId, "timeline"] });
      return results.flatMap((result) => result.records.map((record) => ({ ...record, entryType: result.type })));
    },
  });
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiRequest<EntryRecord>(
      editing ? `/api/${itemType.route}/${editing.id}` : `/api/loans/${loanId}/${itemType.route}`,
      { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) },
    ),
    onSuccess: async () => {
      setEditing(null);
      setValues(initialValues());
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "entries"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "timeline"] }),
      ]);
    },
    onError: (error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (record: EntryRecord) => {
      const type = record.entryType as EntryType;
      const route = entryTypes.find((item) => item.value === type)!.route;
      return apiRequest<void>(`/api/${route}/${record.id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "entries"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "summary"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "timeline"] }),
      ]);
    },
  });

  const selectedSchema = useMemo(() => ({
    payment: paymentCreateSchema,
    disbursement: disbursementCreateSchema,
    contribution: contributionCreateSchema,
    "rate-change": rateChangeCreateSchema,
    note: noteCreateSchema,
  })[entryType], [entryType]);

  function setField(field: keyof FormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function beginEdit(record: EntryRecord & { entryType: EntryType }) {
    setEntryType(record.entryType);
    setEditing(record);
    setValues({
      ...initialValues(),
      date: entryDate(record) || todayIso(),
      amount: moneyInput(record.amount),
      paymentType: (record.type as FormValues["paymentType"]) ?? "emi",
      principalPart: moneyInput(record.principalPart),
      interestPart: moneyInput(record.interestPart),
      status: (record.status as FormValues["status"]) ?? "paid",
      prepaymentMode: (record.prepaymentMode as FormValues["prepaymentMode"]) ?? "reduce-tenure",
      note: record.note ?? "",
      annualRatePercent: record.annualRatePercent?.toString() ?? "",
      rateMode: (record.mode as FormValues["rateMode"]) ?? "keep-emi",
      text: record.text ?? "",
      paymentId: typeof record.paymentId === "string" ? record.paymentId : "",
    });
    setFormError(null);
  }

  function beginMarkPaid(record: EntryRecord & { entryType: EntryType }) {
    beginEdit(record);
    setValues((previous) => ({ ...previous, date: todayIso(), status: "paid" }));
  }

  function exportPayments() {
    const payments = entries.filter((entry) => entry.entryType === "payment");
    const blob = new Blob([paymentEntriesCsv(payments)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `loan-${loanId}-payments.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    let raw: Record<string, unknown>;
    try {
      if (entryType === "payment") {
        raw = {
          date: values.date,
          amount: cents(values.amount),
          type: values.paymentType,
          principalPart: cents(values.principalPart),
          interestPart: cents(values.interestPart),
          status: values.status,
          prepaymentMode: ["prepayment", "part-payment"].includes(values.paymentType) ? values.prepaymentMode : null,
          note: values.note.trim() || null,
        };
      } else if (entryType === "disbursement" || entryType === "contribution") {
        raw = { date: values.date, amount: cents(values.amount), note: values.note.trim() || null };
      } else if (entryType === "rate-change") {
        raw = { effectiveDate: values.date, annualRatePercent: Number(values.annualRatePercent), mode: values.rateMode };
      } else {
        raw = { date: values.date, text: values.text.trim(), paymentId: values.paymentId || null };
      }
    } catch {
      setFormError("Enter valid rupee amounts with no more than two decimal places.");
      return;
    }
    const parsed = selectedSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue?.message ?? "Check the entered values.");
      return;
    }
    mutation.mutate(parsed.data as Record<string, unknown>);
  }

  const entries = listQueries.data ?? [];
  return (
    <div className="entries-layout" role="tabpanel">
      <section className="entry-form-card">
        <div className="chart-heading"><div><h2>{editing ? `Edit ${itemType.label.toLowerCase()}` : "Add loan entry"}</h2><p>Record payments, funding, rate resets, and notes.</p></div></div>
        <label className="form-field" htmlFor="entry-type">Entry type
          <select id="entry-type" value={entryType} onChange={(event) => { setEntryType(event.target.value as EntryType); setEditing(null); setValues(initialValues()); setFormError(null); }}>
            {entryTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <form onSubmit={submit} className="entry-form" noValidate>
          <label className="form-field" htmlFor="entry-date">{entryType === "rate-change" ? "Effective date" : "Date"}
            <input id="entry-date" type="date" value={values.date} onChange={(event) => setField("date", event.target.value)} required />
          </label>
          {entryType === "payment" && <>
            <label className="form-field" htmlFor="payment-kind">Payment type<select id="payment-kind" value={values.paymentType} onChange={(event) => setField("paymentType", event.target.value)}>
              <option value="emi">EMI</option><option value="prepayment">Prepayment</option><option value="part-payment">Part-payment</option><option value="fee">Fee</option><option value="other">Other</option>
            </select></label>
            <label className="form-field" htmlFor="payment-amount">Amount (₹)<input id="payment-amount" inputMode="decimal" value={values.amount} onChange={(event) => setField("amount", event.target.value)} required /></label>
            <label className="form-field" htmlFor="payment-principal">Principal part (₹)<input id="payment-principal" inputMode="decimal" value={values.principalPart} onChange={(event) => setField("principalPart", event.target.value)} /></label>
            <label className="form-field" htmlFor="payment-interest">Interest part (₹)<input id="payment-interest" inputMode="decimal" value={values.interestPart} onChange={(event) => setField("interestPart", event.target.value)} /></label>
            <label className="form-field" htmlFor="payment-status">Status<select id="payment-status" value={values.status} onChange={(event) => setField("status", event.target.value)}><option value="scheduled">Scheduled</option><option value="paid">Paid</option><option value="missed">Missed</option></select></label>
            {["prepayment", "part-payment"].includes(values.paymentType) && <label className="form-field" htmlFor="prepayment-mode">Prepayment option<select id="prepayment-mode" value={values.prepaymentMode} onChange={(event) => setField("prepaymentMode", event.target.value)}><option value="reduce-tenure">Reduce tenure</option><option value="reduce-emi">Reduce EMI</option></select></label>}
            <label className="form-field entry-wide" htmlFor="payment-note">Note (optional)<input id="payment-note" value={values.note} onChange={(event) => setField("note", event.target.value)} /></label>
          </>}
          {(entryType === "disbursement" || entryType === "contribution") && <>
            <label className="form-field" htmlFor="funding-amount">Amount (₹)<input id="funding-amount" inputMode="decimal" value={values.amount} onChange={(event) => setField("amount", event.target.value)} required /></label>
            <label className="form-field" htmlFor="funding-note">Note (optional)<input id="funding-note" value={values.note} onChange={(event) => setField("note", event.target.value)} /></label>
          </>}
          {entryType === "rate-change" && <>
            <label className="form-field" htmlFor="new-rate">New annual rate (%)<input id="new-rate" type="number" min="0" max="1000" step="0.01" value={values.annualRatePercent} onChange={(event) => setField("annualRatePercent", event.target.value)} required /></label>
            <label className="form-field" htmlFor="rate-mode">Reset option<select id="rate-mode" value={values.rateMode} onChange={(event) => setField("rateMode", event.target.value)}><option value="keep-emi">Keep EMI, change tenure</option><option value="keep-tenure">Keep tenure, change EMI</option></select></label>
          </>}
          {entryType === "note" && <>
            <label className="form-field" htmlFor="linked-payment">Linked payment (optional)
              <select id="linked-payment" value={values.paymentId} onChange={(event) => setField("paymentId", event.target.value)}>
                <option value="">No linked payment</option>
                {entries.filter((entry) => entry.entryType === "payment").map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {entry.type} · {formatIndianMoney(asPaise(entry.amount ?? 0))}</option>)}
              </select>
            </label>
            <label className="form-field entry-wide" htmlFor="note-text">Note text<textarea id="note-text" rows={4} maxLength={5000} value={values.text} onChange={(event) => setField("text", event.target.value)} required /></label>
          </>}
          {formError && <p className="field-error entry-wide" role="alert">{formError}</p>}
          <div className="entry-actions entry-wide">
            <button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : editing ? "Save changes" : `Add ${itemType.label.toLowerCase()}`}</button>
            {editing && <button className="button button-secondary" type="button" onClick={() => { setEditing(null); setValues(initialValues()); setFormError(null); }}>Cancel edit</button>}
          </div>
        </form>
      </section>
      <section className="entry-list-card">
        <div className="chart-heading"><div><h2>Recorded entries</h2><p>Changes update this loan’s calculations.</p></div><button className="button button-secondary" type="button" onClick={exportPayments} disabled={!entries.some((entry) => entry.entryType === "payment")}>Export payments CSV</button></div>
        {listQueries.isPending ? <div className="panel-skeleton" aria-label="Loading entries" /> : listQueries.error ? <div className="notice notice-error" role="alert">Could not load loan entries.</div> : entries.length === 0 ? <p className="entry-empty">No entries recorded yet.</p> : (
          <ul className="entry-list">{[...entries].sort((left, right) => entryDate(right).localeCompare(entryDate(left))).map((entry) => {
            const type = entry.entryType as EntryType;
            const label = entryTypes.find((item) => item.value === type)!.label;
            return <li className="entry-row" key={`${type}-${entry.id}`}>
              <div><span className="entry-kind">{label}</span><strong>{entryTitle(entry, type)}</strong><span className="entry-date">{entryDate(entry)}</span></div>
              {typeof entry.amount === "number" && <span className="entry-amount">{formatIndianMoney(asPaise(entry.amount))}</span>}
              <div className="entry-row-actions">{type === "payment" && entry.status === "scheduled" && <button className="button button-primary" type="button" onClick={() => beginMarkPaid(entry as EntryRecord & { entryType: EntryType })}>Mark paid</button>}<button className="button button-secondary" type="button" onClick={() => beginEdit(entry as EntryRecord & { entryType: EntryType })}>Edit</button><button className="button button-danger" type="button" onClick={() => { if (window.confirm(`Delete this ${label.toLowerCase()}? It will move to Trash.`)) deleteMutation.mutate(entry as EntryRecord); }}>Delete</button></div>
            </li>;
          })}</ul>
        )}
        {deleteMutation.error && <p className="field-error" role="alert">{deleteMutation.error.message}</p>}
      </section>
    </div>
  );
}
