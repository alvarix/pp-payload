"use client";

import { useState, useRef } from "react";

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  csvDupes: number;
  dbDupes: number;
  errors: string[];
  rows: {
    email: string;
    orgName: string;
    oldStatus: string;
    newStatus: string;
    note: string;
    action: string;
  }[];
}

const ACTION_COLOR: Record<string, string> = {
  "no change": "text-gray-400",
  error: "text-red-600",
};

function actionColor(action: string) {
  if (action.startsWith("updated") || action.startsWith("would update")) return "text-green-700";
  if (action.startsWith("created") || action.startsWith("would create")) return "text-blue-700";
  if (action.startsWith("db duplicate")) return "text-amber-600";
  return ACTION_COLOR[action] ?? "text-gray-500";
}

/**
 * Brevo campaign CSV import form for organizations.
 * Accepts semicolon-delimited Brevo export, matches orgs by email,
 * and updates outreach status based on delivery/open/bounce signals.
 */
export function ImportForm() {
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) || "");
      setResult(null);
      setError("");
    };
    reader.readAsText(file);
  }

  async function submit(dryRun: boolean) {
    if (!csvText.trim()) {
      setError("Please select a file or paste CSV content.");
      return;
    }
    setError("");
    dryRun ? setIsPreviewing(true) : setIsImporting(true);
    try {
      const res = await fetch("/api/dashboard/brevo-org-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed.");
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message || "Network error.");
    } finally {
      setIsPreviewing(false);
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Expected format: Brevo campaign export (semicolon-delimited)</p>
        <p>Key columns used: <code>Email_ID</code>, <code>Send_Date</code>, <code>Delivered_Date</code>, <code>Open_Date</code>, <code>Total Opens</code>, <code>Hard_Bounce_Date</code>, <code>Hard_Bounce_Reason</code>, <code>Unsubscribe_Date</code></p>
        <p>Status logic: unsubscribe → declined | opened → responded | delivered → contacted | hard bounce → note added</p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
          id="brevo-csv-input"
        />
        <label htmlFor="brevo-csv-input" className="cursor-pointer text-sm text-blue-600 hover:underline">
          {fileName ? fileName : "Choose a CSV file"}
        </label>
        {fileName && <p className="text-xs text-gray-400 mt-1">Click above to change file</p>}
      </div>

      <textarea
        value={csvText}
        onChange={(e) => {
          setCsvText(e.target.value);
          setFileName("");
          setResult(null);
          setError("");
        }}
        placeholder="Or paste Brevo CSV content here…"
        rows={6}
        className="w-full text-xs font-mono border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
      />

      <div className="flex gap-3">
        <button
          onClick={() => submit(true)}
          disabled={!csvText.trim() || isPreviewing || isImporting}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPreviewing ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          onClick={() => submit(false)}
          disabled={!csvText.trim() || isPreviewing || isImporting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isImporting ? "Importing…" : "Import"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-green-800 mb-2">
              {result.created + result.updated > 0
                ? `${result.created} created, ${result.updated} updated`
                : "No changes"}
            </p>
            <p>Created: <strong>{result.created}</strong> <span className="text-gray-500">(placeholder name = email; fill in business name/type manually)</span></p>
            <p>Updated: <strong>{result.updated}</strong></p>
            <p>No change: <strong>{result.skipped}</strong></p>
            {result.csvDupes > 0 && (
              <p className="text-amber-700">
                Duplicate emails in CSV (best signal kept): <strong>{result.csvDupes}</strong>
              </p>
            )}
            {result.dbDupes > 0 && (
              <p className="text-amber-700">
                DB duplicates skipped (manual merge needed): <strong>{result.dbDupes}</strong>
              </p>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">Errors:</p>
              {result.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {result.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-1 text-left">Org</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Email</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Old Status</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">New Status</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Note</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-2 py-1 font-medium">{row.orgName || "—"}</td>
                      <td className="border border-gray-200 px-2 py-1 text-gray-500">{row.email}</td>
                      <td className="border border-gray-200 px-2 py-1">{row.oldStatus || "—"}</td>
                      <td className="border border-gray-200 px-2 py-1">{row.newStatus || "—"}</td>
                      <td className="border border-gray-200 px-2 py-1 text-gray-500 max-w-xs truncate" title={row.note}>{row.note || "—"}</td>
                      <td className={`border border-gray-200 px-2 py-1 ${actionColor(row.action)}`}>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
