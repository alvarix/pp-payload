import type { Job } from "@/payload-types";
import { JobCard } from "./JobCard";

interface StatusColumnProps {
  status: string;
  label: string;
  jobs: Job[];
  color: string;
}

/** Color classes for each status column header. */
const COLOR_MAP: Record<string, string> = {
  gray: "bg-gray-100 text-gray-800",
  blue: "bg-blue-100 text-blue-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  purple: "bg-purple-100 text-purple-800",
};

/**
 * A single kanban-style column for one job status.
 */
export function StatusColumn({ status, label, jobs, color }: StatusColumnProps) {
  const colorClasses = COLOR_MAP[color] || COLOR_MAP.gray;

  return (
    <div className="flex-shrink-0 w-72">
      <div className={`rounded-t-lg px-3 py-2 ${colorClasses} flex items-center gap-2`}>
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs bg-white/60 rounded-full px-2 py-0.5">
          {jobs.length}
        </span>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-lg bg-gray-50 p-2 space-y-2 min-h-[200px]">
        {jobs.length === 0 && (
          <p className="text-xs text-gray-400 italic text-center pt-8">
            No jobs
          </p>
        )}
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
