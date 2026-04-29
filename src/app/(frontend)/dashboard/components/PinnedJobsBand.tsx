"use client";

import { CardActions } from "./CardActions";

export type PinnedJobItem = {
  id: number;
  clientName: string;
  petNames: string;
  status: string;
};

/**
 * Collapsible ribbon band of pinned jobs at the top of the jobs dashboard.
 * Mirrors the orgs dashboard's Pinned band.
 */
export function PinnedJobsBand({ jobs }: { jobs: PinnedJobItem[] }) {
  return (
    <details className="mb-2" open>
      <summary className="flex items-center gap-2 mb-2 cursor-pointer list-none select-none">
        <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-rose-100 text-rose-700 ring-1 ring-rose-300">
          Pinned
        </span>
        <span className="text-xs text-gray-500">{jobs.length}</span>
      </summary>
      <div className="flex flex-wrap gap-2">
        {jobs.length === 0 && (
          <p className="text-xs text-gray-500 italic">None</p>
        )}
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-2 bg-white border border-rose-300 rounded-lg px-3 py-1.5 shadow-sm"
          >
            <a
              href={`/admin/collections/jobs/${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-900 hover:text-blue-700 whitespace-nowrap"
            >
              {job.clientName}
            </a>
            <span className="text-xs text-gray-500">{job.petNames}</span>
            <span className="text-xs text-gray-500 capitalize">· {job.status.replace(/_/g, " ")}</span>
            <CardActions
              endpoint="/api/dashboard/actions"
              idField="jobId"
              id={job.id}
              pinned={true}
              label={job.clientName}
            />
          </div>
        ))}
      </div>
    </details>
  );
}
