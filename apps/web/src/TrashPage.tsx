import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { asPaise, formatIndianMoney } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

type TrashType = "loan" | "payment" | "disbursement" | "contribution" | "rate-change" | "note";
interface TrashRow {
  id: string;
  entityType: TrashType;
  loanId?: string;
  name?: string;
  date?: string;
  effectiveDate?: string;
  amount?: number;
  type?: string;
  annualRatePercent?: number;
  mode?: string;
  text?: string;
  note?: string | null;
  deletedAt: string | null;
}

const typeLabel: Record<TrashType, string> = {
  loan: "Loan",
  payment: "Payment",
  disbursement: "Disbursement",
  contribution: "Contribution",
  "rate-change": "Rate change",
  note: "Note",
};

function title(row: TrashRow): string {
  if (row.entityType === "loan") return row.name ?? "Untitled loan";
  if (row.entityType === "payment") return `${row.type ?? "Payment"} · ${row.date ?? ""}`;
  if (row.entityType === "note") return row.text ?? "Note";
  if (row.entityType === "rate-change") return `${row.annualRatePercent ?? ""}% · ${row.mode ?? "Rate reset"}`;
  return row.note || (row.entityType === "disbursement" ? "Loan disbursement" : "Own contribution");
}

export function TrashPage() {
  const queryClient = useQueryClient();
  const trashQuery = useQuery({ queryKey: ["trash"], queryFn: () => apiRequest<TrashRow[]>("/api/trash") });
  const restoreMutation = useMutation({
    mutationFn: (row: TrashRow) => apiRequest<void>(`/api/trash/${row.entityType}/${row.id}/restore`, { method: "POST", body: "{}" }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["trash"] }), queryClient.invalidateQueries({ queryKey: ["loans"] })]);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (row: TrashRow) => apiRequest<void>(`/api/trash/${row.entityType}/${row.id}`, { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE" }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trash"] }),
  });
  const rows = useMemo(() => [...(trashQuery.data ?? [])].sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? "")), [trashQuery.data]);

  return (
    <div className="trash-page">
      <div className="page-heading"><div><div className="eyebrow">RECOVERABLE RECORDS</div><h1>Trash</h1><p>Restore removed items or permanently delete them.</p></div><span className="loan-count">{rows.length}</span></div>
      {trashQuery.isPending ? <div className="panel-skeleton" aria-label="Loading Trash" /> : trashQuery.error ? <div className="notice notice-error" role="alert">Could not load Trash.</div> : rows.length === 0 ? <section className="chart-card trash-empty"><span aria-hidden="true">✓</span><strong>Trash is empty</strong><p>Deleted loans and entries will appear here.</p></section> : (
        <section className="chart-card trash-list-card" aria-label="Deleted records">
          <ul className="trash-list">{rows.map((row) => <li key={`${row.entityType}-${row.id}`}>
            <span className={`trash-type trash-type-${row.entityType}`}>{typeLabel[row.entityType]}</span>
            <div className="trash-record-copy"><strong>{title(row)}</strong><span>{row.deletedAt ? `Deleted ${row.deletedAt.slice(0, 10)}` : "Deleted"}{row.loanId ? ` · Loan ${row.loanId}` : ""}</span></div>
            {typeof row.amount === "number" && <span className="trash-amount">{formatIndianMoney(asPaise(row.amount))}</span>}
            <div className="trash-actions"><button className="button button-secondary" type="button" onClick={() => restoreMutation.mutate(row)} disabled={restoreMutation.isPending}>Restore</button><button className="button button-danger" type="button" onClick={() => { if (window.confirm("Permanently delete this item? This cannot be undone.")) deleteMutation.mutate(row); }} disabled={deleteMutation.isPending}>Delete permanently</button></div>
          </li>)}</ul>
          {(restoreMutation.error || deleteMutation.error) && <p className="field-error" role="alert">{(restoreMutation.error ?? deleteMutation.error)?.message}</p>}
        </section>
      )}
    </div>
  );
}
