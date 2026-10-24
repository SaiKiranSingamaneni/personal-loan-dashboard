import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { asPaise, derivePropertyCost, formatIndianMoney, rupeesToPaise, type PropertyCostComponent, type PropertyCostKind, type PropertyCostGroup } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";
import { amountInWords, formatIndianMoneyInput, isValidIndianMoneyInput } from "./inputFormatting.js";

type CostRow = { id?: string; name: string; group: PropertyCostGroup; kind: PropertyCostKind; amount: string; note: string };
type ApiCostRow = Omit<PropertyCostComponent, "group" | "kind" | "amount"> & { id: string; group: string; kind: string; amount: number };
type PropertyData = {
  details: { unitLabel: string | null; superBuiltUpSft: number; carpetSft: number | null; ratePerSft: number; parkingSlots: number; parkingCharges: number | null; notedGrandTotal: number | null; notedTotalBeforeCash: number | null; notedFinalCost: number | null } | null;
  components: ApiCostRow[];
};
type DetailsForm = { unitLabel: string; superBuiltUpSft: string; carpetSft: string; ratePerSft: string; parkingSlots: string; notedGrandTotal: string; notedTotalBeforeCash: string; notedFinalCost: string };

const initialDetails: DetailsForm = { unitLabel: "", superBuiltUpSft: "", carpetSft: "", ratePerSft: "", parkingSlots: "0", notedGrandTotal: "", notedTotalBeforeCash: "", notedFinalCost: "" };
const validKinds: readonly string[] = ["BASE_PRICE", "GST", "PARKING", "CLUB_HOUSE", "OTHER_AGREEMENT", "CORPUS_FUND", "DOCUMENTATION_DEPOSIT", "OTHER_ADDITIONAL", "CASH_PAYMENT"];

function kindFor(kind: string, group: string): PropertyCostKind {
  if (kind === "IN_HAND_CASH") return "CASH_PAYMENT";
  if (kind === "OTHER" || kind === "INTERIORS" || kind === "MAINTENANCE_DEPOSIT") return group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL";
  if (validKinds.includes(kind)) return kind as PropertyCostKind;
  return group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL";
}

function moneyText(paise: number | null | undefined): string {
  if (paise == null) return "";
  const absolute = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function parseAmount(value: string): number {
  if (value.trim() === "" || !isValidIndianMoneyInput(value)) return 0;
  try { return rupeesToPaise(value); } catch { return 0; }
}

function hint(id: string, text: string) {
  return <small id={`${id}-hint`} className="input-hint">{text}</small>;
}

function amountError(value: string): string | undefined {
  return value !== "" && !isValidIndianMoneyInput(value) ? "Enter an amount with valid Indian grouping and up to two decimal places." : undefined;
}

function labelFor(group: PropertyCostGroup): string {
  return group === "AGREEMENT" ? "Agreement" : group === "ADDITIONAL" ? "Additional" : "Cash";
}

export function PropertyCostEditor({ loanId, sanctionedLoan = 0 }: { loanId: string; sanctionedLoan?: number }) {
  const queryClient = useQueryClient();
  const [details, setDetails] = useState(initialDetails);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const propertyQuery = useQuery({ queryKey: ["loans", loanId, "property"], queryFn: () => apiRequest<PropertyData>(`/api/loans/${loanId}/property`) });

  useEffect(() => {
    const data = propertyQuery.data;
    if (!data) return;
    const d = data.details;
    const nextRows: CostRow[] = data.components.map((item) => ({
      id: item.id,
      name: item.name,
      group: (item.group === "OUTSIDE_AGREEMENT" ? (item.kind === "IN_HAND_CASH" || item.kind === "CASH_PAYMENT" ? "CASH" : "ADDITIONAL") : item.group) as PropertyCostGroup,
      kind: kindFor(item.kind, item.group),
      amount: moneyText(item.amount),
      note: item.note ?? "",
    }));
    if (!nextRows.some((row) => row.kind === "PARKING") && d?.parkingCharges != null) {
      nextRows.push({ name: "Parking", group: "AGREEMENT", kind: "PARKING", amount: moneyText(d.parkingCharges), note: "" });
    }
    setDetails({
      unitLabel: d?.unitLabel ?? "",
      superBuiltUpSft: d?.superBuiltUpSft ? String(d.superBuiltUpSft) : "",
      carpetSft: d?.carpetSft == null ? "" : String(d.carpetSft),
      ratePerSft: moneyText(d?.ratePerSft),
      parkingSlots: String(d?.parkingSlots ?? 0),
      notedGrandTotal: moneyText(d?.notedGrandTotal),
      notedTotalBeforeCash: moneyText(d?.notedTotalBeforeCash),
      notedFinalCost: moneyText(d?.notedFinalCost),
    });
    setRows(nextRows);
  }, [propertyQuery.data]);

  const amount = (kind: PropertyCostKind) => rows.find((row) => row.kind === kind)?.amount ?? "";
  const setAmount = (kind: PropertyCostKind, value: string, name: string, group: PropertyCostGroup) => {
    setRows((current) => {
      const found = current.findIndex((row) => row.kind === kind);
      const next = [...current];
      if (found < 0) next.push({ name, group, kind, amount: value, note: "" });
      else next[found] = { ...next[found]!, amount: value };
      return next;
    });
    setSaveError(null);
  };
  const setNote = (kind: PropertyCostKind, value: string, name: string, group: PropertyCostGroup) => {
    setRows((current) => {
      const found = current.findIndex((row) => row.kind === kind);
      const next = [...current];
      if (found < 0) next.push({ name, group, kind, amount: "", note: value });
      else next[found] = { ...next[found]!, note: value };
      return next;
    });
  };
  const update = (index: number, key: keyof CostRow, value: string) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const components = useMemo(() => rows.map((row) => ({ ...row, amount: asPaise(parseAmount(row.amount)) })), [rows]);
  const detailsForEngine = useMemo(() => ({
    unitLabel: details.unitLabel,
    superBuiltUpSft: Number(details.superBuiltUpSft) || 0,
    carpetSft: details.carpetSft === "" ? null : Number(details.carpetSft),
    ratePerSft: asPaise(parseAmount(details.ratePerSft)),
    parkingSlots: Number(details.parkingSlots) || 0,
    parkingCharges: amount("PARKING") === "" ? null : asPaise(parseAmount(amount("PARKING"))),
    notedGrandTotal: details.notedGrandTotal === "" ? null : asPaise(parseAmount(details.notedGrandTotal)),
    notedTotalBeforeCash: details.notedTotalBeforeCash === "" ? null : asPaise(parseAmount(details.notedTotalBeforeCash)),
    notedFinalCost: details.notedFinalCost === "" ? null : asPaise(parseAmount(details.notedFinalCost)),
  }), [details, rows]);
  const derived = useMemo(() => derivePropertyCost({ components, details: detailsForEngine, sanctionedLoan: asPaise(sanctionedLoan) }), [components, detailsForEngine, sanctionedLoan]);
  const areaRatePaise = Math.round((Number(details.superBuiltUpSft) || 0) * parseAmount(details.ratePerSft));

  const mutation = useMutation({
    mutationFn: () => {
      const invalidAmounts = [details.ratePerSft, details.notedGrandTotal, details.notedTotalBeforeCash, details.notedFinalCost, ...rows.map((row) => row.amount)].some((value) => amountError(value) !== undefined);
      const invalidNames = rows.some((row) => row.amount !== "" && !row.name.trim());
      const invalidAreas = [details.superBuiltUpSft, details.carpetSft].some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))
        || !Number.isInteger(Number(details.parkingSlots))
        || Number(details.parkingSlots) < 0;
      if (invalidAmounts || invalidNames || invalidAreas) throw new Error("Review the highlighted property fields before saving.");
      return apiRequest(`/api/loans/${loanId}/property`, { method: "PUT", body: JSON.stringify({
        components: rows.filter((row) => row.name.trim() && row.amount !== "").map((row) => ({ ...(row.id ? { id: row.id } : {}), name: row.name.trim(), group: row.group, kind: row.kind, amount: parseAmount(row.amount), note: row.note || null })),
        details: {
          unitLabel: details.unitLabel || null,
          superBuiltUpSft: Number(details.superBuiltUpSft) || 0,
          carpetSft: details.carpetSft === "" ? null : Number(details.carpetSft),
          ratePerSft: parseAmount(details.ratePerSft),
          parkingSlots: Number(details.parkingSlots) || 0,
          parkingCharges: amount("PARKING") === "" ? null : parseAmount(amount("PARKING")),
          notedGrandTotal: details.notedGrandTotal === "" ? null : parseAmount(details.notedGrandTotal),
          notedTotalBeforeCash: details.notedTotalBeforeCash === "" ? null : parseAmount(details.notedTotalBeforeCash),
          notedFinalCost: details.notedFinalCost === "" ? null : parseAmount(details.notedFinalCost),
        },
      }) });
    },
    onSuccess: async () => {
      setSaveError(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["loans", loanId, "property"] }), queryClient.invalidateQueries({ queryKey: ["loans", loanId, "dashboard"] })]);
    },
    onError: (error) => setSaveError(error instanceof Error ? error.message : "Could not save property costs."),
  });

  const setDetail = (key: keyof DetailsForm, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
    setSaveError(null);
  };
  const detailField = (key: keyof DetailsForm, label: string, hintText: string, opts: { type?: string; money?: boolean; step?: string } = {}) => {
    const id = `property-${key}`;
    const numberValue = Number(details[key]);
    const error = opts.money
      ? amountError(details[key])
      : opts.type === "number" && details[key] !== "" && (!Number.isFinite(numberValue) || numberValue < 0 || (key === "parkingSlots" && !Number.isInteger(numberValue)))
        ? key === "parkingSlots" ? "Enter a whole number of parking slots." : "Enter a valid non-negative number."
        : undefined;
    const words = opts.money ? amountInWords(details[key]) : "";
    return <label className="property-field" htmlFor={id} key={key}>
      <span>{label}</span>
      <input id={id} type={opts.type ?? "text"} step={opts.step} min={opts.type === "number" ? 0 : undefined} value={details[key]} aria-invalid={error !== undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={(event) => setDetail(key, opts.money ? formatIndianMoneyInput(event.target.value) : event.target.value)} />
      {hint(id, hintText)}
      {words && <small className="amount-words">{words}</small>}
      {error && <small id={`${id}-error`} className="field-error">{error}</small>}
    </label>;
  };
  const costField = (kind: PropertyCostKind, label: string, group: PropertyCostGroup, hintText: string) => {
    const id = `cost-${kind}`;
    const value = amount(kind);
    const error = amountError(value);
    const words = amountInWords(value);
    const note = rows.find((row) => row.kind === kind)?.note ?? "";
    const noteId = `${id}-note`;
    return <div className="property-cost-fields" key={kind}>
      <label className="property-field" htmlFor={id}>
        <span>{label} (₹)</span>
        <input id={id} inputMode="decimal" value={value} aria-invalid={error !== undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} onChange={(event) => setAmount(kind, formatIndianMoneyInput(event.target.value), label, group)} />
        {hint(id, hintText)}
        {words && <small className="amount-words">{words}</small>}
        {error && <small id={`${id}-error`} className="field-error">{error}</small>}
      </label>
      <label className="property-field" htmlFor={noteId}>
        <span>Transaction notes (optional)</span>
        <input id={noteId} value={note} aria-describedby={`${noteId}-hint`} onChange={(event) => setNote(kind, event.target.value, label, group)} />
        {hint(noteId, "Optional notes for this cost item or transaction.")}
      </label>
    </div>;
  };
  const customRows = (group: PropertyCostGroup) => rows.map((row, index) => ({ row, index })).filter(({ row }) => row.group === group && (group === "AGREEMENT" ? !["BASE_PRICE", "GST", "PARKING"].includes(row.kind) : group === "ADDITIONAL" ? !["CORPUS_FUND", "DOCUMENTATION_DEPOSIT"].includes(row.kind) : false)).map(({ row, index }) => {
    const prefix = `row-${group}-${index}`;
    const nameId = `${prefix}-name`;
    const amountId = `${prefix}-amount`;
    const noteId = `${prefix}-note`;
    const error = amountError(row.amount);
    const nameError = row.amount !== "" && !row.name.trim() ? "Enter a charge name." : undefined;
    const words = amountInWords(row.amount);
    return <div className="property-cost-row" key={row.id ?? `${group}-${index}`}>
      <label className="property-field" htmlFor={nameId}><span>Charge name</span><input id={nameId} value={row.name} aria-invalid={nameError !== undefined} aria-describedby={`${nameId}-hint${nameError ? ` ${nameId}-error` : ""}`} onChange={(event) => update(index, "name", event.target.value)} />{hint(nameId, "Use the name shown on your agreement or receipt.")}{nameError && <small id={`${nameId}-error`} className="field-error">{nameError}</small>}</label>
      <label className="property-field" htmlFor={amountId}><span>Amount (₹)</span><input id={amountId} inputMode="decimal" value={row.amount} aria-invalid={error !== undefined} aria-describedby={`${amountId}-hint${error ? ` ${amountId}-error` : ""}`} onChange={(event) => update(index, "amount", formatIndianMoneyInput(event.target.value))} />{hint(amountId, "Enter the exact amount, including paise.")}{words && <small className="amount-words">{words}</small>}{error && <small id={`${amountId}-error`} className="field-error">{error}</small>}</label>
      <label className="property-field" htmlFor={noteId}><span>Transaction notes (optional)</span><input id={noteId} value={row.note} aria-describedby={`${noteId}-hint`} onChange={(event) => update(index, "note", event.target.value)} />{hint(noteId, "Optional notes for this cost row.")}</label>
      <button type="button" className="button button-secondary" aria-label={`Remove ${labelFor(group)} charge ${row.name || index + 1}`} onClick={() => setRows((current) => current.filter((_item, rowIndex) => rowIndex !== index))}>Remove</button>
    </div>;
  });
  const addRow = (group: "AGREEMENT" | "ADDITIONAL") => setRows((current) => [...current, { name: "", group, kind: group === "AGREEMENT" ? "OTHER_AGREEMENT" : "OTHER_ADDITIONAL", amount: "", note: "" }]);
  const money = (value: number) => formatIndianMoney(asPaise(value));
  const loanPercent = derived.grandTotal > 0 ? (sanctionedLoan / derived.grandTotal * 100).toFixed(1) : "—";
  const selfPercent = derived.grandTotal > 0 ? (derived.selfPaidBank / derived.grandTotal * 100).toFixed(1) : "—";

  if (propertyQuery.isPending) return <div className="panel-skeleton" aria-label="Loading property details" />;
  if (propertyQuery.error) return <div className="notice notice-error" role="alert">Could not load property details.</div>;
  return <section className="property-editor" aria-label="Property cost details">
    <div className="chart-heading"><div><h2>Property and cost details</h2><p>Record what the flat costs across the agreement, additional charges, and cash tiers.</p></div><button className="button button-primary" type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save property details"}</button></div>
    <div className="property-editor-layout">
      <div className="property-cards">
        <fieldset className="form-section property-cost-card">
          <legend>Property details</legend>
          <div className="form-grid">
            {detailField("unitLabel", "Unit label", "Optional flat, plot, or unit identifier.")}
            {detailField("superBuiltUpSft", "Super built-up area (sft)", "Area as written in the agreement.", { type: "number", step: "any" })}
            {detailField("carpetSft", "Carpet area (sft, optional)", "Carpet area as written in the agreement.", { type: "number", step: "any" })}
            {detailField("ratePerSft", "Rate per sft (₹)", "Rate per sft before GST, as in the agreement.", { money: true })}
            {detailField("parkingSlots", "Parking slots", "Number of parking slots included.", { type: "number", step: "1" })}
          </div>
          <button type="button" className="button button-secondary" onClick={() => setAmount("BASE_PRICE", moneyText(areaRatePaise), "Base price (before GST)", "AGREEMENT")}>Use as base price</button>
          <footer className="property-subtotal property-details-footer"><span>Area × rate =</span><strong>{money(areaRatePaise)}</strong></footer>
        </fieldset>

        <fieldset className="form-section property-cost-card">
          <legend>Grand total (agreement value)</legend>
          <div className="form-grid">
            {costField("BASE_PRICE", "Base price (before GST)", "AGREEMENT", "Enter the base price before GST, or fill it from area × rate above.")}
            {costField("PARKING", "Parking charges", "AGREEMENT", "Parking charges included in the agreement value.")}
            {customRows("AGREEMENT")}
            {costField("GST", "GST amount", "AGREEMENT", "Enter the GST amount shown in your agreement or demand letter. We do not assume a rate.")}
          </div>
          <button type="button" className="button button-secondary property-add-row" onClick={() => addRow("AGREEMENT")}>Add agreement charge</button>
          <p className="section-help">GST is {derived.effectiveGstPreGstPercent.toFixed(2)}% of the pre-GST amount and {derived.effectiveGstGrandTotalPercent.toFixed(2)}% of the grand total.</p>
          <footer className="property-subtotal"><span>Pre-GST subtotal</span><strong>{money(derived.preGstSubtotal)}</strong><span>GST</span><strong>{money(derived.gst)}</strong><span>GRAND TOTAL (incl. GST)</span><strong>{money(derived.grandTotal)}</strong></footer>
          {detailField("notedGrandTotal", "Grand total as per my notes (₹)", "Optional cross-check against your paperwork.", { money: true })}
        </fieldset>

        <fieldset className="form-section property-cost-card">
          <legend>Additional charges (outside the grand total)</legend>
          <p className="section-help">Charges you pay on top of the grand total. Check your agreement for what is included.</p>
          {customRows("ADDITIONAL")}
          <div className="form-grid">
            {costField("CORPUS_FUND", "Corpus fund", "ADDITIONAL", "Corpus or sinking fund shown in your paperwork.")}
            {costField("DOCUMENTATION_DEPOSIT", "Documentation + deposit", "ADDITIONAL", "Documentation fees and deposits paid on top of the grand total.")}
          </div>
          <button type="button" className="button button-secondary property-add-row" onClick={() => addRow("ADDITIONAL")}>Add additional charge</button>
          <footer className="property-subtotal"><span>TOTAL BEFORE CASH</span><strong>{money(derived.totalBeforeCash)}</strong></footer>
          {detailField("notedTotalBeforeCash", "Total before cash as per my notes (₹)", "Optional cross-check against your paperwork.", { money: true })}
        </fieldset>

        <fieldset className="form-section property-cost-card">
          <legend>Cash component</legend>
          {costField("CASH_PAYMENT", "Cash paid separately towards the flat", "CASH", "Cash paid separately towards the flat. Not part of the agreement, registration, or loan calculation.")}
          <footer className="property-subtotal"><span>FINAL COST OF THE FLAT</span><strong>{money(derived.finalCost)}</strong></footer>
          {detailField("notedFinalCost", "Final cost as per my notes (₹)", "Optional cross-check against your paperwork.", { money: true })}
        </fieldset>
      </div>

      <aside className="property-crosscheck" aria-label="Property cross-checks">
        <h3>Cross-check</h3>
        {derived.checks.map((item) => <div className={`crosscheck-row${item.ok ? " is-ok" : " is-warning"}`} key={item.id}>
          <span aria-hidden="true">{item.ok ? "✓" : "!"}</span>
          <div><strong>{item.label}</strong><small>{item.ok ? "Matches" : `Difference: ${money(Math.abs(item.difference))}`}</small></div>
        </div>)}
        {derived.parkingPerSlot != null && <p className="parking-per-slot">Parking per slot: <strong>{money(derived.parkingPerSlot)}</strong></p>}
        <div className="property-share-readout"><strong>Funding share of grand total</strong><span>Loan: {loanPercent}%</span><span>Your bank-paid share: {selfPercent}%</span></div>
      </aside>
    </div>
    {saveError && <p className="notice notice-error" role="alert">{saveError}</p>}
  </section>;
}
