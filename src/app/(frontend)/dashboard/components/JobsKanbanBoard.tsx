"use client";

import { useLayoutEffect, useState } from "react";
import { QuickActions } from "./QuickActions";

export type JobForCard = {
  id: number;
  clientName: string;
  petNames: string;
  due_date?: string | null;
  pics_received?: boolean | null;
  job_type?: string | null;
  notes?: string | null;
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
 */
export function JobsKanbanBoard({ columns }: { columns: JobColumnData[] }) {
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useLayoutEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as string[] | null;
      if (!saved) return;
      const keys = columns.map((c) => c.key);
      if (saved.length === keys.length && keys.every((k) => saved.includes(k))) {
        setOrder(saved);
      }
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

  const sorted = order.map((key) => columns.find((c) => c.key === key)!).filter(Boolean);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {sorted.map((col) => {
        const isDragging = dragging === col.key;
        const isOver = dragOver === col.key;
        const headerColor = COLOR_MAP[col.color] ?? COLOR_MAP.gray;

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-72 transition-opacity ${isDragging ? "opacity-40" : ""}`}
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
                <p className="text-xs text-gray-400 italic text-center pt-8">No jobs</p>
              )}
              {col.jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job }: { job: JobForCard }) {
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
    <div className="bg-white rounded border border-gray-200 p-3 shadow-sm">
      <div className="flex items-start justify-between">
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
        <span className={`text-xs whitespace-nowrap ml-2 ${dueDateClass}`}>
          {dueDateLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs">
        {job.pics_received ? (
          <span className="text-green-600" title="Pics received">&#10003; Pics</span>
        ) : (
          <span className="text-gray-400" title="No pics yet">&#10007; Pics</span>
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
