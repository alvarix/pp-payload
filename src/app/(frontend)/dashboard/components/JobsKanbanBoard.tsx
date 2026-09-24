"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuickActions } from "./QuickActions";
import { CardActions } from "./CardActions";

export type JobForCard = {
  id: number;
  clientName: string;
  petNames: string;
  due_date?: string | null;
  pics_received?: boolean | null;
  job_type?: string | null;
  notes?: string | null;
  pinned?: boolean | null;
  status: string;
};

export type JobColumnData = {
  key: string;
  label: string;
  color: string;
  jobs: JobForCard[];
};

const COLOR_MAP: Record<string, string> = {
  gray:   "bg-gray-200 text-gray-900",
  blue:   "bg-blue-200 text-gray-900",
  yellow: "bg-yellow-200 text-gray-900",
  orange: "bg-orange-200 text-gray-900",
  purple: "bg-purple-200 text-gray-900",
};

const LS_KEY = "jobs-dashboard-col-order";

/**
 * Client wrapper for the jobs kanban board.
 * Persists column order to localStorage; drag-to-reorder column headers.
 * Supports multi-select for bulk status changes via checkboxes on cards.
 */
export function JobsKanbanBoard({ columns }: { columns: JobColumnData[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useLayoutEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as string[] | null;
      if (!saved) return;
      const keys = columns.map((c) => c.key);
      const keySet = new Set(keys);
      const merged = [
        ...saved.filter((k) => keySet.has(k)),
        ...keys.filter((k) => !saved.includes(k)),
      ];
      setOrder(merged);
    } catch {}
  }, []);

  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    if (key !== dragging) setDragOver(key);
  }

  function handleDrop(targetKey: string) {
    if (!dragging || dragging === targetKey) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragging);
    const to = next.indexOf(targetKey);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    setOrder(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setDragging(null);
    setDragOver(null);
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkStatus("");
  }

  /** Apply the chosen status to all selected jobs, then refresh and clear. */
  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/dashboard/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_set_status", jobIds: [...selected], status: bulkStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Bulk status change failed:", data);
        alert(`Bulk update failed: ${data?.error ?? res.statusText}`);
        return;
      }
      if (data?.failed?.length > 0) {
        alert(`Updated ${data.updated.length} job(s). Failed: ${data.failed.map((f: any) => f.id).join(", ")}`);
      }
      clearSelection();
      router.refresh();
    } catch (e) {
      console.error("Bulk status change error:", e);
    } finally {
      setBulkBusy(false);
    }
  }

  const sorted = order.map((key) => columns.find((c) => c.key === key)!).filter(Boolean);

  return (
    <div className="relative h-full">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-md">
          <span className="text-sm font-medium text-gray-800">
            {selected.size} selected
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            disabled={bulkBusy}
            className="text-xs px-2 py-1.5 rounded border border-gray-300 bg-gray-50 text-gray-800 disabled:opacity-50"
          >
            <option value="">Set status…</option>
            {ALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={applyBulkStatus}
            disabled={!bulkStatus || bulkBusy}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
          >
            {bulkBusy ? "Updating…" : "Apply"}
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto overflow-y-auto h-full w-full min-w-0 pb-4">
      {sorted.map((col) => {
        const isDragging = dragging === col.key;
        const isOver = dragOver === col.key;
        const headerColor = COLOR_MAP[col.color] ?? COLOR_MAP.gray;

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-64 sm:w-72 transition-opacity ${isDragging ? "opacity-40" : ""}`}
          >
            <div
              draggable
              onDragStart={() => setDragging(col.key)}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDrop={() => handleDrop(col.key)}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
              className={`rounded-t-lg px-3 py-2 ${headerColor} flex items-center gap-2 cursor-grab active:cursor-grabbing select-none ${isOver ? "ring-2 ring-blue-400 ring-inset" : ""}`}
            >
              <span className="font-semibold text-sm">{col.label}</span>
              <span className="text-xs bg-white text-gray-700 rounded-full px-2 py-0.5">
                {col.jobs.length}
              </span>
            </div>
            <div className="border border-t-0 border-gray-200 rounded-b-lg bg-gray-50 p-2 space-y-2 min-h-[200px]">
              {col.jobs.length === 0 && (
                <p className="text-xs text-gray-500 italic text-center pt-8">No jobs</p>
              )}
              {col.jobs.map((job) => (
                <JobCard key={job.id} job={job} selected={selected.has(job.id)} onToggleSelect={() => toggleSelect(job.id)} />
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

const ALL_STATUSES = [
  { value: "inquiry", label: "Inquiry" },
  { value: "intake_received", label: "Intake Received" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_pics_or_payment", label: "Awaiting Pics/Payment" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "delivered", label: "Delivered" },
  { value: "portfolio_ready", label: "Portfolio Ready" },
];

function JobCard({ job, selected, onToggleSelect }: { job: JobForCard; selected: boolean; onToggleSelect: () => void }) {
  let dueDateClass = "text-gray-500";
  let dueDateLabel = "No due date";

  if (job.due_date) {
    const due = new Date(job.due_date);
    const daysUntil = Math.floor((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    dueDateLabel = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (daysUntil < 0) {
      dueDateClass = "text-red-600 font-semibold";
    } else if (daysUntil <= 3) {
      dueDateClass = "text-amber-600 font-semibold";
    }
  }

  return (
    <div className={`bg-white rounded border ${selected ? "border-blue-400 ring-1 ring-blue-300" : job.pinned ? "border-rose-300 ring-1 ring-rose-200" : "border-gray-200"} p-3 shadow-sm`}>
      <label className="flex items-center justify-end">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          title="Select for bulk status change"
          className="h-3.5 w-3.5 accent-blue-600"
        />
      </label>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={`/admin/collections/jobs/${job.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-700 hover:underline truncate block"
          >
            {job.clientName}
          </a>
          <p className="text-xs text-gray-500 truncate">{job.petNames}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs whitespace-nowrap ${dueDateClass}`}>
            {dueDateLabel}
          </span>
          <CardActions
            endpoint="/api/dashboard/actions"
            idField="jobId"
            id={job.id}
            pinned={job.pinned ?? false}
            label={job.clientName}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs">
        {job.pics_received ? (
          <span className="text-green-600" title="Pics received">&#10003; Pics</span>
        ) : (
          <span className="text-gray-500" title="No pics yet">&#10007; Pics</span>
        )}
        {job.job_type && (
          <span className="text-gray-500 capitalize">{job.job_type}</span>
        )}
      </div>

      {job.notes && (
        <p className="text-xs text-gray-500 mt-1 truncate" title={job.notes}>
          {job.notes}
        </p>
      )}

      <QuickActions jobId={job.id} currentStatus={job.status} />
    </div>
  );
}
