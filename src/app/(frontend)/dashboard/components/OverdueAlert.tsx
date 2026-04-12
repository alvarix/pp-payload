interface StaleJob {
  id: number;
  clientName: string;
  status: string;
  daysStale: number;
}

/**
 * Banner showing stale/overdue jobs that need attention.
 * Renders nothing if there are no stale jobs.
 */
export function OverdueAlert({ staleJobs }: { staleJobs: StaleJob[] }) {
  if (staleJobs.length === 0) return null;

  return (
    <div className="mt-4 border border-red-300 bg-red-50 rounded-lg p-4">
      <h3 className="text-red-800 font-semibold mb-2">
        Attention: {staleJobs.length} stale job{staleJobs.length > 1 ? "s" : ""}
      </h3>
      <ul className="space-y-1">
        {staleJobs.map((job) => (
          <li key={job.id} className="text-sm text-red-700">
            <a
              href={`/admin/collections/jobs/${job.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-red-900"
            >
              {job.clientName}
            </a>
            {" "}&mdash; {job.status.replace(/_/g, " ")} for {job.daysStale} days
          </li>
        ))}
      </ul>
    </div>
  );
}
