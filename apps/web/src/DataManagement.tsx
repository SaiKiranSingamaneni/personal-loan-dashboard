import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { exportDataSchema, type ExportData } from "@loan-dashboard/shared";
import { apiRequest } from "./api.js";

interface ImportPreview {
  preview: true;
  counts: Record<string, number>;
}
interface ImportResult {
  preview: false;
  counts: Record<string, number>;
}
interface BackupResult {
  path: string;
}

function downloadFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function timestampName(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function DataManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [importData, setImportData] = useState<ExportData | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportMutation = useMutation({
    mutationFn: () => apiRequest<ExportData>("/api/export"),
    onSuccess: (data) => downloadFile(JSON.stringify(data, null, 2), `loans-export-${timestampName(new Date())}.json`, "application/json;charset=utf-8"),
    onError: (requestError) => setError(requestError.message),
  });
  const backupMutation = useMutation({
    mutationFn: () => apiRequest<BackupResult>("/api/backup", { method: "POST", body: "{}" }),
    onSuccess: (result) => { setError(null); setMessage(`Backup created: ${result.path.split(/[\\/]/).at(-1)}`); },
    onError: (requestError) => setError(requestError.message),
  });
  const overwriteMutation = useMutation({
    mutationFn: () => apiRequest<ImportResult>("/api/import", {
      method: "POST",
      body: JSON.stringify({ mode: "overwrite", data: importData }),
    }),
    onSuccess: async (result) => {
      setPreview(null);
      setImportData(null);
      setMessage(`Imported ${result.counts.loans ?? 0} loans and ${result.counts.payments ?? 0} payments. The database now matches this export.`);
      await queryClient.invalidateQueries();
      navigate("/", { replace: true });
    },
    onError: (requestError) => setError(requestError.message),
  });

  async function chooseImport(file: File | undefined) {
    setError(null);
    setMessage(null);
    setPreview(null);
    setImportData(null);
    if (file === undefined) return;
    setFileName(file.name);
    let value: unknown;
    try {
      value = JSON.parse(await file.text()) as unknown;
    } catch {
      setError("The selected file is not valid JSON.");
      return;
    }
    const parsed = exportDataSchema.safeParse(value);
    if (!parsed.success) {
      setError(`Import file validation failed: ${parsed.error.issues[0]?.message ?? "invalid data"}`);
      return;
    }
    setImportData(parsed.data);
    try {
      const result = await apiRequest<ImportPreview>("/api/import", {
        method: "POST",
        body: JSON.stringify({ mode: "preview", data: parsed.data }),
      });
      setPreview(result);
    } catch (previewError) {
      setImportData(null);
      setError(previewError instanceof Error ? previewError.message : "Could not preview this import.");
    }
  }

  function confirmOverwrite() {
    if (importData === null || preview === null) return;
    if (!window.confirm("Replace all current loan data with the validated import? This cannot be undone except from a backup.")) return;
    setError(null);
    setMessage(null);
    overwriteMutation.mutate();
  }

  return (
    <div className="data-management-page">
      <div className="page-heading"><div><div className="eyebrow">LOCAL DATA</div><h1>Data and backups</h1><p>Export a portable copy, validate an import, or create a database backup.</p></div></div>
      {message && <p className="notice notice-success" role="status">{message}</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <section className="chart-card data-action-card">
        <div><h2>Export all data</h2><p>Download every loan and its entries as a versioned JSON file.</p></div>
        <button className="button button-primary" type="button" onClick={() => { setError(null); exportMutation.mutate(); }} disabled={exportMutation.isPending}>{exportMutation.isPending ? "Preparing export…" : "Export all data"}</button>
      </section>
      <section className="chart-card data-action-card">
        <div><h2>Import data</h2><p>Select a dashboard JSON export. It is validated and previewed before replacing current data.</p></div>
        <label className="form-field import-file-field" htmlFor="import-file">Import JSON file<input id="import-file" type="file" accept="application/json,.json" onChange={(event) => { void chooseImport(event.target.files?.[0]); }} /></label>
        {fileName && <span className="selected-file">Selected: {fileName}</span>}
        {preview && <div className="import-preview" role="status"><strong>Validated import preview</strong><span>{preview.counts.loans ?? 0} loans · {preview.counts.payments ?? 0} payments · {preview.counts.notes ?? 0} notes</span><small>Current records will be replaced only after you confirm.</small><button className="button button-danger" type="button" onClick={confirmOverwrite} disabled={overwriteMutation.isPending}>{overwriteMutation.isPending ? "Importing…" : "Replace current data"}</button></div>}
      </section>
      <section className="chart-card data-action-card">
        <div><h2>Database backup</h2><p>Create an immediate SQLite backup in the configured backups folder.</p></div>
        <button className="button button-secondary" type="button" onClick={() => { setError(null); backupMutation.mutate(); }} disabled={backupMutation.isPending}>{backupMutation.isPending ? "Creating backup…" : "Create backup now"}</button>
      </section>
    </div>
  );
}
