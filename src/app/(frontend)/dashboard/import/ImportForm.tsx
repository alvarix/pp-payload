"use client";

import { useState, useRef } from "react";

interface ImportResult {
  clientsCreated: number;
  clientsMatched: number;
  jobsCreated: number;
  eventsMatched: string[];
  eventsMissed: string[];
  skipped: number;
  errors: string[];
  rows: { name: string; pet: string; event: string; status: string; action: string }[];
}

/**
 * Client component for CSV file upload and import.
 * Sends CSV content to /api/dashboard/import for processing.
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
      setError("Please select a file or paste CSV content first.");
      return;
    }
    setError("");
    dryRun ? setIsPreviewing(true) : setIsImporting(true);
    try {
      const res = await fetch("/api/dashboard/import", {
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
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-input"
        />
        <label
          htmlFor="csv-input"
          className="cursor-pointer text-sm text-blue-600 hover:underline"
        >
          {fileName ? fileName : "Choose a CSV file"}
        </label>
        {fileName && (
          <p className="text-xs text-gray-400 mt-1">Click above to change file</p>
        )}
      </div>
      <textarea
        value={csvText}
        onChange={(e) => {
          setCsvText(e.target.value);
          setFileName("");
          setResult(null);
          setError("");
        }}
        placeholder="Or paste CSV content here…"
        rows={6}
        className="w-full text-xs font-mono border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
      />


      <div className="flex gap-3">
        <button
          onClick={() => submit(true)}
          disabled={!csvText || isPreviewing || isImporting}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPreviewing ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          onClick={() => submit(false)}
          disabled={!csvText || isPreviewing || isImporting}
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
              {result.jobsCreated === 0 && isPreviewing === false
                ? "Preview result"
                : result.jobsCreated > 0
                  ? `Import complete — ${result.jobsCreated} jobs created`
                  : "Dry run complete"}
            </p>
            <p>Clients created: <strong>{result.clientsCreated}</strong></p>
            <p>Clients matched: <strong>{result.clientsMatched}</strong></p>
            <p>Jobs created: <strong>{result.jobsCreated}</strong></p>
            <p>Rows skipped: <strong>{result.skipped}</strong></p>
            {result.eventsMatched.length > 0 && (
              <p>Events matched: <strong>{result.eventsMatched.join(", ")}</strong></p>
            )}
            {result.eventsMissed.length > 0 && (
              <p className="text-amber-700">
                Events not found (linked as notes): <strong>{result.eventsMissed.join(", ")}</strong>
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
                    <th className="border border-gray-200 px-2 py-1 text-left">Name</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Pet</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Event</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Status</th>
                    <th className="border border-gray-200 px-2 py-1 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-2 py-1">{row.name}</td>
                      <td className="border border-gray-200 px-2 py-1">{row.pet}</td>
                      <td className="border border-gray-200 px-2 py-1">{row.event}</td>
                      <td className="border border-gray-200 px-2 py-1">{row.status}</td>
                      <td className="border border-gray-200 px-2 py-1 text-gray-500">{row.action}</td>
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
