import type { Job, Client } from "@/payload-types";
import { QuickActions } from "./QuickActions";

/**
 * Card for a single job in a status column.
 * Shows client name, pet names, due date, pics status, and quick actions.
 */
export function JobCard({ job }: { job: Job }) {
  const client = job.client as Client | null;
  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
      client.email
    : "Unknown";

  const petNames =
    job.pets?.map((p) => p.name).join(", ") || "No pets listed";

  // Due date coloring
  let dueDateClass = "text-gray-500";
  let dueDateLabel = "No due date";
  if (job.due_date) {
    const due = new Date(job.due_date);
    const now = new Date();
    const daysUntil = Math.floor(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    dueDateLabel = due.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
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
            {clientName}
          </a>
          <p className="text-xs text-gray-500 truncate">{petNames}</p>
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

      <QuickActions jobId={job.id} currentStatus={job.status as string} />
    </div>
  );
}
