"use client";

import { CardActions } from "./CardActions";

export type RecentJobItem = {
  id: number;
  clientName: string;
  petNames: string;
  status: string;
  updatedAt: string;
  pinned?: boolean | null;
};

/**
 * Collapsible ribbon of the most recently updated jobs (any status),
 * so off-board jobs (delivered, portfolio_ready) stay reachable.
 */
export function RecentJobsBand({ jobs }: { jobs: RecentJobItem[] }) {
  return (
    <details className="mb-2">
      <summary className="flex items-center gap-2 mb-2 cursor-pointer list-none select-none">
        <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-sky-100 text-sky-700 ring-1 ring-sky-300">
          Recent
        </span>
        <span className="text-xs text-gray-400">{jobs.length}</span>
      </summary>
      <div className="flex flex-wrap gap-2">
        {jobs.length === 0 && (
          <p className="text-xs text-gray-400 italic">None</p>
        )}
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-2 bg-white border border-sky-200 rounded-lg px-3 py-1.5 shadow-sm"
          >
            <a
              href={`/admin/collections/jobs/${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-900 hover:text-blue-700 whitespace-nowrap"
            >
              {job.clientName}
            </a>
            <span className="text-xs text-gray-400">{job.petNames}</span>
            <span className="text-xs text-gray-400 capitalize">· {job.status.replace(/_/g, " ")}</span>
            <span className="text-xs text-gray-400">· {relativeTime(job.updatedAt)}</span>
            <CardActions
              endpoint="/api/dashboard/actions"
              idField="jobId"
              id={job.id}
              pinned={job.pinned ?? false}
              label={job.clientName}
            />
          </div>
        ))}
      </div>
    </details>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
