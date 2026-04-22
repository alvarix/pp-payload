import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Job, Client } from "@/payload-types";

import { StatsBar } from "./components/StatsBar";
import { OverdueAlert } from "./components/OverdueAlert";
import { StatusColumn } from "./components/StatusColumn";

/** Status values shown as columns (not delivered or archived). */
const ACTIVE_STATUSES = [
  "intake_received",
  "in_progress",
  "ready_to_ship",
  "awaiting_pics_or_payment",
  "inquiry",
] as const;

/** Labels and colors for each active status column. */
const STATUS_META: Record<string, { label: string; color: string }> = {
  inquiry: { label: "Inquiry", color: "gray" },
  intake_received: { label: "Intake Received", color: "blue" },
  in_progress: { label: "In Progress", color: "yellow" },
  awaiting_pics_or_payment: { label: "Awaiting Pics/Payment", color: "orange" },
  ready_to_ship: { label: "Ready to Ship", color: "purple" },
};

/**
 * Stale thresholds in days, keyed by job status.
 * A job is considered stale if updatedAt exceeds this threshold.
 */
export const STALE_THRESHOLDS: Record<string, number> = {
  inquiry: 3,
  intake_received: 5,
  awaiting_pics_or_payment: 7,
};

/**
 * Returns days stale for a job, or 0 if not stale.
 * @param status - current job status
 * @param updatedAt - ISO date string of last update
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

  // Active jobs (not delivered or portfolio_ready), with client populated
  const { docs: activeJobs } = await payload.find({
    collection: "jobs",
    where: { status: { not_in: ["delivered", "portfolio_ready"] } },
    sort: "due_date",
    limit: 200,
    depth: 1,
  });

  // Jobs ready to ship ("drawn, awaiting delivery")
  const { totalDocs: drawnCount } = await payload.find({
    collection: "jobs",
    where: { status: { equals: "ready_to_ship" } },
    limit: 0,
  });

  // Jobs awaiting client info (pics or payment)
  const { totalDocs: needInfoCount } = await payload.find({
    collection: "jobs",
    where: { status: { equals: "awaiting_pics_or_payment" } },
    limit: 0,
  });

  // Jobs where client has given feedback (portfolio testimonial exists)
  const { docs: jobsWithTestimonial } = await payload.find({
    collection: "jobs",
    where: { "portfolio.testimonial": { exists: true } },
    limit: 0,
  });
  const feedbackCount = jobsWithTestimonial.length;

  // Total client count
  const { totalDocs: totalClients } = await payload.find({
    collection: "clients",
    limit: 0,
  });

  // All jobs (shallow) to compute top clients by job count
  const { docs: allJobs } = await payload.find({
    collection: "jobs",
    limit: 500,
    depth: 1,
  });

  // Count jobs per client ID
  const jobCountByClientId: Record<number, { name: string; count: number; id: number }> = {};
  for (const job of allJobs) {
    const client = job.client as Client | null;
    if (!client || typeof client !== "object") continue;
    const id = client.id;
    if (!jobCountByClientId[id]) {
      const name =
        [client.first_name, client.last_name].filter(Boolean).join(" ") ||
        client.email;
      jobCountByClientId[id] = { name, count: 0, id };
    }
    jobCountByClientId[id].count++;
  }

  // Top 5 clients by job count
  const topClients = Object.values(jobCountByClientId)
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ name: c.name, jobCount: c.count, id: c.id }));

  // Organizations with follow-up due today or earlier
  const today = new Date().toISOString().split("T")[0];
  const { totalDocs: orgsNeedingFollowUp } = await payload.find({
    collection: "organizations",
    where: { followUpDate: { less_than_equal: today } },
    limit: 0,
  });

  // Group active jobs by status for column rendering
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

  // Detect stale/overdue jobs
  const staleJobs: { id: number; clientName: string; status: string; daysStale: number }[] = [];
  for (const job of activeJobs) {
    const days = getDaysStale(job.status as string, job.updatedAt);
    if (days > 0) {
      const client = job.client as Client | null;
      const clientName =
        client && typeof client === "object"
          ? [client.first_name, client.last_name].filter(Boolean).join(" ") ||
            client.email
          : "Unknown";
      staleJobs.push({ id: job.id, clientName, status: job.status as string, daysStale: days });
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/client-import"
            className="text-sm px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Import CSV
          </a>
          <a
            href="/dashboard/organizations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Organizations
            {orgsNeedingFollowUp > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {orgsNeedingFollowUp}
              </span>
            )}
          </a>
        </div>
      </div>

      <StatsBar
        activeJobCount={activeJobs.length}
        needInfoCount={needInfoCount}
        drawnCount={drawnCount}
        feedbackCount={feedbackCount}
        totalClients={totalClients}
        overdueCount={staleJobs.length}
        leadsNeedingFollowUp={orgsNeedingFollowUp}
        topClients={topClients}
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
