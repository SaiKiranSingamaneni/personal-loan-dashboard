import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { asPaise, formatIndianMoney, rupeesToPaise } from "@loan-dashboard/shared";
import { apiRequest, ApiClientError } from "./api.js";

type CostGroup = "AGREEMENT" | "OUTSIDE_AGREEMENT";
interface CostItem {
  id?: string;
  name: string;
  group: CostGroup;
  kind: string;
  amount: string;
  note: string;
}
interface PersistedCostItem {
  id: string;
  name: string;
  group: CostGroup;
  kind: string;
  amount: number;
  note: string | null;
}
interface PropertyData {
  components: PersistedCostItem[];
  invoiceGrandTotal: number | null;
}
const suggestions: Record<CostGroup, [string, string][]> = {
  AGREEMENT: [
    ["BASE_PRICE", "Base price"], ["GST", "GST"], ["PARKING", "Parking"],
    ["CLUB_HOUSE", "Club house"], ["STAMP_DUTY", "Stamp duty"],
    ["REGISTRATION", "Registration"], ["OTHER", "Other"],
  ],
  OUTSIDE_AGREEMENT: [
    ["CORPUS_FUND", "Corpus fund"], ["DOCUMENTATION_DEPOSIT", "Documentation deposit"],
    ["IN_HAND_CASH", "In-hand cash"], ["MAINTENANCE_DEPOSIT", "Maintenance deposit"],
    ["INTERIORS", "Interiors"], ["OTHER", "Other"],
  ],
};

function toRupees(value: number): string {
  return `${Math.floor(value / 100)}.${(value % 100).toString().padStart(2, "0")}`;
}

function blankItem(group: CostGroup): CostItem {
  return { name: "", group, kind: "OTHER", amount: "", note: "" };
}

function formatError(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Could not save property costs.";
}

export function PropertyCostEditor({ loanId }: { loanId: string }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<CostItem[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const propertyQuery = useQuery({
    queryKey: ["loans", loanId, "property"],
    queryFn: () => apiRequest<PropertyData>(`/api/loans/${loanId}/property`),
  });
  useEffect(() => {
    if (propertyQuery.data === undefined) return;
    setItems(propertyQuery.data.components.map((item) => ({
      id: item.id,
      name: item.name,
      group: item.group,
      kind: item.kind,
      amount: toRupees(item.amount),
      note: item.note ?? "",
    })));
    setInvoiceTotal(propertyQuery.data.invoiceGrandTotal == null ? "" : toRupees(propertyQuery.data.invoiceGrandTotal));
  }, [propertyQuery.data]);
  const saveMutation = useMutation({
    mutationFn: () => {
      const components = items.filter((item) => item.name.trim() !== "" || item.amount !== "").map((item) => ({
        ...(item.id === undefined ? {} : { id: item.id }),
        name: item.name.trim(),
        group: item.group,
        kind: item.kind.trim() || "OTHER",
        amount: rupeesToPaise(item.amount || "0"),
        note: item.note.trim() || null,
      }));
      return apiRequest<PropertyData & { invoiceMismatch: number | null }>(`/api/loans/${loanId}/property`, {
        method: "PUT",
        body: JSON.stringify({
          components,
          invoiceGrandTotal: invoiceTotal.trim() === "" ? null : rupeesToPaise(invoiceTotal),
        }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "property"] }),
        queryClient.invalidateQueries({ queryKey: ["loans", loanId, "dashboard"] }),
      ]);
    },
  });

  const totals = items.reduce((sum, item) => {
    if (!item.amount.trim()) return sum;
    try {
      const amount = rupeesToPaise(item.amount);
      if (item.group === "AGREEMENT") sum.agreement += amount;
      else sum.extra += amount;
    } catch {
      return sum;
    }
    return sum;
  }, { agreement: 0, extra: 0 });
  const total = totals.agreement + totals.extra;
  let invoicePaise: number | null = null;
  try {
    invoicePaise = invoiceTotal.trim() === "" ? null : rupeesToPaise(invoiceTotal);
  } catch {
    invoicePaise = null;
  }
  const mismatch = invoicePaise === null || invoicePaise === totals.agreement
    ? null
    : Math.abs(invoicePaise - totals.agreement);

  function updateItem(index: number, update: Partial<CostItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
    saveMutation.reset();
  }

  if (propertyQuery.isPending) return <div className="panel-skeleton" aria-label="Loading property costs" />;
  if (propertyQuery.error) return <div className="notice notice-error" role="alert">Could not load property costs.</div>;

  function groupEditor(group: CostGroup, title: string) {
    const groupItems = items.map((item, index) => ({ item, index })).filter(({ item }) => item.group === group);
    return <section className="property-cost-group" aria-label={title}>
      <div className="property-cost-group-heading"><h3>{title}</h3><strong>{formatIndianMoney(asPaise(group === "AGREEMENT" ? totals.agreement : totals.extra))}</strong></div>
      <div className="property-cost-table-head" aria-hidden="true"><span>Name</span><span>Amount (Rs)</span><span>Note</span><span /></div>
      {groupItems.map(({ item, index }) => <div className="property-cost-row" key={item.id ?? `${group}-${index}`}>
        <label className="sr-only" htmlFor={`cost-name-${group}-${index}`}>Cost item name</label>
        <input id={`cost-name-${group}-${index}`} list={`cost-options-${group}`} value={item.name} placeholder="Cost item" onChange={(event) => {
          const found = suggestions[group].find(([, label]) => label.toLowerCase() === event.target.value.toLowerCase());
          updateItem(index, { name: event.target.value, kind: found?.[0] ?? "OTHER" });
        }} />
        <datalist id={`cost-options-${group}`}>{suggestions[group].map(([kind, name]) => <option key={kind} value={name} />)}</datalist>
        <label className="sr-only" htmlFor={`cost-amount-${group}-${index}`}>Amount in rupees</label>
        <input id={`cost-amount-${group}-${index}`} inputMode="decimal" value={item.amount} placeholder="0.00" onChange={(event) => updateItem(index, { amount: event.target.value })} />
        <label className="sr-only" htmlFor={`cost-note-${group}-${index}`}>Note</label>
        <input id={`cost-note-${group}-${index}`} value={item.note} placeholder="Optional note" onChange={(event) => updateItem(index, { note: event.target.value })} />
        <button className="icon-button" type="button" aria-label={`Remove ${item.name || "cost item"}`} title="Remove cost item" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
      </div>)}
      <button className="button button-secondary property-add-row" type="button" onClick={() => setItems((current) => [...current, blankItem(group)])}>+ Add cost item</button>
    </section>;
  }

  return <section className="property-cost-editor" aria-labelledby="property-cost-heading">
    <div className="chart-heading"><div><h2 id="property-cost-heading">Property cost</h2><p>Separate the builder agreement from costs paid outside it.</p></div></div>
    {groupEditor("AGREEMENT", "Agreement value")}
    {groupEditor("OUTSIDE_AGREEMENT", "Extra costs outside the agreement")}
    <div className="property-invoice-row">
      <label className="form-field" htmlFor="builder-invoice-total">Grand total as per builder invoice (incl. GST)
        <input id="builder-invoice-total" inputMode="decimal" value={invoiceTotal} placeholder="Optional" onChange={(event) => { setInvoiceTotal(event.target.value); saveMutation.reset(); }} />
      </label>
      {mismatch !== null && <p className="notice notice-warning" role="status">Builder invoice differs from the agreement items by {formatIndianMoney(asPaise(mismatch))}.</p>}
    </div>
    <div className="property-cost-totals" aria-live="polite">
      <div><span>Agreement value</span><strong>{formatIndianMoney(asPaise(totals.agreement))}</strong></div>
      <div><span>Extra costs</span><strong>{formatIndianMoney(asPaise(totals.extra))}</strong></div>
      <div><span>Total property outlay</span><strong>{formatIndianMoney(asPaise(total))}</strong></div>
    </div>
    {saveMutation.error && <p className="field-error" role="alert">{formatError(saveMutation.error)}</p>}
    {saveMutation.isSuccess && <p className="property-save-success" role="status">Property costs saved.</p>}
    <button className="button button-primary" type="button" disabled={saveMutation.isPending || items.some((item) => item.name.trim() !== "" && item.amount === "") || items.some((item) => item.name.trim() === "" && item.amount !== "") || items.some((item) => item.amount !== "" && !/^\d+(\.\d{1,2})?$/.test(item.amount)) || (invoiceTotal !== "" && !/^\d+(\.\d{1,2})?$/.test(invoiceTotal))} onClick={() => saveMutation.mutate()}>
      {saveMutation.isPending ? "Saving…" : "Save property costs"}
    </button>
  </section>;
}