"use client";

import { useState, useRef } from "react";

export interface ColumnDef {
  name: string;
  note: string;
}

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

const STATUS_OPTIONS = [
  { value: "", label: "Auto (past → delivered, future → inquiry)" },
  { value: "inquiry", label: "Inquiry" },
  { value: "intake_received", label: "Intake Received" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_pics_or_payment", label: "Awaiting Pics / Payment" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "delivered", label: "Delivered" },
];

const TYPE_OPTIONS = [
  { value: "street", label: "Street (+7 days)" },
  { value: "studio", label: "Studio (+10 days)" },
];

/**
 * Wraps a CSV cell value in quotes if it contains a comma.
 * @param val - raw cell value
 */
function csvCell(val: string): string {
  return val.includes(",") ? `"${val}"` : val;
}

/**
 * Strips excluded columns from a raw CSV string.
 * @param raw - full CSV text
 * @param excluded - set of header names to drop
 */
function filterCSV(raw: string, excluded: Set<string>): string {
  if (excluded.size === 0) return raw;
  const lines = raw.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const keepIdx = headers.reduce<number[]>((acc, h, i) => {
    if (!excluded.has(h)) acc.push(i);
    return acc;
  }, []);
  return lines
    .map((line) => {
      const cells = line.split(",");
      return keepIdx.map((i) => cells[i] ?? "").join(",");
    })
    .join("\n");
}

/**
 * Client component for CSV file upload and import.
 * Supports paste/file mode and a per-field form mode.
 * Column chips show per-field notes on hover and can be excluded with ×.
 * @param columnDefs - predefined column names and their per-field notes
 * @param eventNames - available event names for the Event select
 */
export function ImportForm({
  columnDefs,
  eventNames,
}: {
  columnDefs: ColumnDef[];
  eventNames: string[];
}) {
  const [inputMode, setInputMode] = useState<"paste" | "form">("paste");
  const [csvText, setCsvText] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [excludedColumns, setExcludedColumns] = useState<Set<string>>(new Set());
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const predefinedNames = new Set(columnDefs.map((c) => c.name));

  function parseExtraHeaders(text: string): string[] {
    const firstLine = text.trim().split(/\r?\n/)[0] || "";
    const tokens = firstLine.split(",").map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const hasHeaders = tokens.some((t) => predefinedNames.has(t));
    if (!hasHeaders) return [];
    return tokens.filter((h) => !predefinedNames.has(h));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      setCsvText(text);
      setExtraColumns(parseExtraHeaders(text));
      setExcludedColumns(new Set());
      setResult(null);
      setError("");
    };
    reader.readAsText(file);
  }

  function toggleColumn(col: string) {
    setExcludedColumns((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  }

  function setField(name: string, value: string) {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setResult(null);
    setError("");
  }

  /** Builds a one-row CSV from the form values, using active (non-excluded) columns. */
  function formToCSV(): string {
    const active = columnDefs.filter((c) => !excludedColumns.has(c.name));
    const headers = active.map((c) => c.name).join(",");
    const values = active.map((c) => csvCell(formValues[c.name] ?? "")).join(",");
    return `${headers}\n${values}`;
  }

  function resolvedCSV(): string {
    if (inputMode === "form") return formToCSV();

    const text = csvText.trim();
    const firstLineTokens = text.split(/\r?\n/)[0].split(",").map((t) => t.trim().toLowerCase());
    const hasHeaders = columnDefs.some((c) => firstLineTokens.includes(c.name.toLowerCase()));

    if (!hasHeaders) {
      const headers = columnDefs.filter((c) => !excludedColumns.has(c.name)).map((c) => c.name).join(",");
      return `${headers}\n${text}`;
    }
    return text;
  }

  function hasInput(): boolean {
    if (inputMode === "form") {
      return columnDefs
        .filter((c) => !excludedColumns.has(c.name))
        .some((c) => (formValues[c.name] ?? "").trim() !== "");
    }
    return !!csvText.trim();
  }

  async function submit(dryRun: boolean) {
    if (!hasInput()) {
      setError(inputMode === "form" ? "Fill in at least one field." : "Please select a file or paste CSV content first.");
      return;
    }
    setError("");
    dryRun ? setIsPreviewing(true) : setIsImporting(true);
    try {
      const res = await fetch("/api/dashboard/client-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: filterCSV(resolvedCSV(), excludedColumns), dryRun }),
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

  const hoveredNote = columnDefs.find((c) => c.name === hoveredCol)?.note ?? null;

  return (
    <div className="space-y-4">
      {/* Column chips — always visible, hover for note, × to exclude */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-2 text-sm">Fields</h2>
        <div className="flex flex-wrap gap-2">
          {columnDefs.map((col) => {
            const excluded = excludedColumns.has(col.name);
            return (
              <span
                key={col.name}
                onMouseEnter={() => setHoveredCol(col.name)}
                onMouseLeave={() => setHoveredCol(null)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono cursor-default transition-colors ${
                  excluded
                    ? "bg-gray-100 text-gray-400 line-through"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {col.name}
                <button
                  type="button"
                  onClick={() => toggleColumn(col.name)}
                  onMouseEnter={() => setHoveredCol(col.name)}
                  className="text-gray-400 hover:text-red-500 leading-none font-sans ml-0.5"
                  title={excluded ? "Re-include" : "Exclude from import"}
                >
                  {excluded ? "+" : "×"}
                </button>
              </span>
            );
          })}
          {extraColumns.map((col) => {
            const excluded = excludedColumns.has(col);
            return (
              <span
                key={col}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono cursor-default transition-colors border border-dashed ${
                  excluded ? "border-gray-200 text-gray-400 line-through" : "border-gray-300 text-gray-500 hover:bg-gray-50"
                }`}
                title="Column detected in CSV but not a recognized field"
              >
                {col}
                <button
                  type="button"
                  onClick={() => toggleColumn(col)}
                  className="text-gray-400 hover:text-red-500 leading-none font-sans ml-0.5"
                >
                  {excluded ? "+" : "×"}
                </button>
              </span>
            );
          })}
        </div>

        {hoveredNote && (
          <p className="mt-2 text-xs text-gray-500 border-t border-gray-100 pt-2">
            {hoveredNote}
          </p>
        )}
      </div>

      {eventNames.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-700">
          <strong>Available events:</strong> {eventNames.join(", ")}
        </div>
      )}

      {/* Input mode toggle */}
      <div className="flex gap-1 text-xs">
        {(["paste", "form"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => { setInputMode(mode); setResult(null); setError(""); }}
            className={`px-3 py-1 rounded border transition-colors ${
              inputMode === mode
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {mode === "paste" ? "Paste / File" : "Enter manually"}
          </button>
        ))}
      </div>

      {inputMode === "paste" ? (
        <>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-input"
            />
            <label htmlFor="csv-input" className="cursor-pointer text-sm text-blue-600 hover:underline">
              {fileName ? fileName : "Choose a CSV file"}
            </label>
            {fileName && <p className="text-xs text-gray-400 mt-1">Click above to change file</p>}
          </div>

          <textarea
            value={csvText}
            onChange={(e) => {
              const text = e.target.value;
              setCsvText(text);
              setFileName("");
              setExtraColumns(parseExtraHeaders(text));
              setExcludedColumns(new Set());
              setResult(null);
              setError("");
            }}
            placeholder="Or paste CSV content here…"
            rows={6}
            className="w-full text-xs font-mono border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
          />
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm grid grid-cols-2 gap-3">
          {columnDefs
            .filter((col) => !excludedColumns.has(col.name))
            .map((col) => (
              <div key={col.name}>
                <label className="block text-xs text-gray-500 mb-1 font-medium">{col.name}</label>
                {col.name === "Type" ? (
                  <select
                    value={formValues["Type"] ?? "street"}
                    onChange={(e) => setField("Type", e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : col.name === "Status" ? (
                  <select
                    value={formValues["Status"] ?? ""}
                    onChange={(e) => setField("Status", e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : col.name === "Event" && eventNames.length > 0 ? (
                  <select
                    value={formValues["Event"] ?? ""}
                    onChange={(e) => setField("Event", e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">— none —</option>
                    {eventNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={col.name === "Email" ? "email" : "text"}
                    value={formValues[col.name] ?? ""}
                    onChange={(e) => setField(col.name, e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder={col.name === "Email" ? "client@example.com" : ""}
                  />
                )}
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => submit(true)}
          disabled={!hasInput() || isPreviewing || isImporting}
          className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPreviewing ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          onClick={() => submit(false)}
          disabled={!hasInput() || isPreviewing || isImporting}
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
              {result.jobsCreated > 0
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
