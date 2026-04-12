import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Job, Client } from "@/payload-types";

import { StatsBar } from "./components/StatsBar";
import { OverdueAlert } from "./components/OverdueAlert";
import { StatusColumn } from "./components/StatusColumn";

/** Status values considered "active" (not delivered/portfolio_ready). */
const ACTIVE_STATUSES = [
  "new",
  "intake_received",
  "in_progress",
  "awaiting_pics_or_payment",
  "ready_to_ship",
] as const;

/** Labels and colors for each active status column. */
const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "gray" },
  intake_received: { label: "Intake Received", color: "blue" },
  in_progress: { label: "In Progress", color: "yellow" },
  awaiting_pics_or_payment: { label: "Awaiting Pics/Payment", color: "orange" },
  ready_to_ship: { label: "Ready to Ship", color: "purple" },
};

/**
 * Stale thresholds in days, keyed by job status.
 * A job is "stale" if updatedAt is older than the threshold.
 */
export const STALE_THRESHOLDS: Record<string, number> = {
  new: 3,
  intake_received: 5,
  awaiting_pics_or_payment: 7,
};

/**
 * Determines whether a job is stale based on its status and updatedAt.
 * @param status - current job status
 * @param updatedAt - ISO date string of last update
 * @returns number of days stale, or 0 if not stale
 */
export function getDaysStale(status: string, updatedAt: string | undefined): number {
  if (!updatedAt) return 0;
  const threshold = STALE_THRESHOLDS[status];
  if (!threshold) return 0;
  const days = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return days > threshold ? days : 0;
}

export default async function DashboardPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  // Fetch active jobs with populated client
  const { docs: activeJobs } = await payload.find({
    collection: "jobs",
    where: {
      status: { not_in: ["delivered", "portfolio_ready"] },
    },
    sort: "due_date",
    limit: 200,
    depth: 1,
  });

  // Fetch client counts
  const { totalDocs: totalClients } = await payload.find({
    collection: "clients",
    limit: 0,
  });

  // Fetch clients with tags for tag breakdown
  const { docs: clientsWithTags } = await payload.find({
    collection: "clients",
    limit: 200,
  });

  // Build tag counts
  const tagCounts: Record<string, number> = {};
  for (const client of clientsWithTags) {
    const tags = (client as any).tags as { tag: string }[] | undefined;
    if (tags) {
      for (const t of tags) {
        if (t.tag) {
          tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1;
        }
      }
    }
  }

  // Leads summary: follow-ups due today or earlier
  const today = new Date().toISOString().split("T")[0];
  const { totalDocs: leadsNeedingFollowUp } = await payload.find({
    collection: "leads",
    where: {
      followUpDate: { less_than_equal: today },
    },
    limit: 0,
  });

  // Group jobs by status
  const jobsByStatus: Record<string, Job[]> = {};
  for (const status of ACTIVE_STATUSES) {
    jobsByStatus[status] = [];
  }
  for (const job of activeJobs) {
    const s = job.status as string;
    if (jobsByStatus[s]) {
      jobsByStatus[s].push(job as Job);
    }
  }

  // Status counts for stats bar
  const statusCounts: Record<string, number> = {};
  for (const [status, jobs] of Object.entries(jobsByStatus)) {
    statusCounts[status] = jobs.length;
  }

  // Detect stale jobs
  const staleJobs: { id: number; clientName: string; status: string; daysStale: number }[] = [];
  for (const job of activeJobs) {
    const days = getDaysStale(job.status as string, job.updatedAt);
    if (days > 0) {
      const client = job.client as Client | null;
      const clientName = client
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
          client.email
        : "Unknown";
      staleJobs.push({
        id: job.id,
        clientName,
        status: job.status as string,
        daysStale: days,
      });
    }
  }

  const overdueCount = staleJobs.length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <a
          href="/admin/collections/leads"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          Leads
          {leadsNeedingFollowUp > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {leadsNeedingFollowUp}
            </span>
          )}
        </a>
      </div>

      <StatsBar
        activeJobCount={activeJobs.length}
        totalClients={totalClients}
        overdueCount={overdueCount}
        leadsNeedingFollowUp={leadsNeedingFollowUp}
        statusCounts={statusCounts}
        tagCounts={tagCounts}
      />

      <OverdueAlert staleJobs={staleJobs} />

      <div className="flex gap-4 overflow-x-auto pb-4 mt-6">
        {ACTIVE_STATUSES.map((status) => (
          <StatusColumn
            key={status}
            status={status}
            label={STATUS_META[status].label}
            jobs={jobsByStatus[status]}
            color={STATUS_META[status].color}
          />
        ))}
      </div>
    </div>
  );
}
