import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Job, Client } from "@/payload-types";

import { StatsBar } from "./components/StatsBar";
import { OverdueAlert } from "./components/OverdueAlert";
import { JobsKanbanBoard, type JobColumnData, type JobForCard } from "./components/JobsKanbanBoard";
import { PinnedJobsBand, type PinnedJobItem } from "./components/PinnedJobsBand";
import { RecentJobsBand, type RecentJobItem } from "./components/RecentJobsBand";
import { FullscreenButton } from "./components/FullscreenButton";

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
const STALE_THRESHOLDS: Record<string, number> = {
  inquiry: 3,
  intake_received: 5,
  awaiting_pics_or_payment: 7,
};

/**
 * Returns days stale for a job, or 0 if not stale.
 * @param status - current job status
 * @param updatedAt - ISO date string of last update
 */
function getDaysStale(status: string, updatedAt: string | undefined): number {
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

  // Pinned jobs (any status) for the Pinned ribbon
  const { docs: pinnedJobs } = await payload.find({
    collection: "jobs",
    where: { pinned: { equals: true } },
    sort: "-updatedAt",
    limit: 100,
    depth: 1,
  });
  const pinnedItems: PinnedJobItem[] = pinnedJobs.map((job) => {
    const client = job.client as Client | null;
    const clientName =
      client && typeof client === "object"
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.email
        : "Unknown";
    return {
      id: job.id,
      clientName,
      petNames: job.pets?.map((p) => p.name).join(", ") || "No pets listed",
      status: job.status as string,
    };
  });

  // Most recently updated jobs (any status) so off-board jobs stay reachable
  const { docs: recentJobs } = await payload.find({
    collection: "jobs",
    sort: "-updatedAt",
    limit: 10,
    depth: 1,
  });
  const recentItems: RecentJobItem[] = recentJobs.map((job) => {
    const client = job.client as Client | null;
    const clientName =
      client && typeof client === "object"
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.email
        : "Unknown";
    return {
      id: job.id,
      clientName,
      petNames: job.pets?.map((p) => p.name).join(", ") || "No pets listed",
      status: job.status as string,
      updatedAt: job.updatedAt,
      pinned: job.pinned ?? null,
    };
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

  // Group active jobs by status and build serializable column data
  const jobsByStatus: Record<string, JobForCard[]> = {};
  for (const status of ACTIVE_STATUSES) jobsByStatus[status] = [];

  for (const job of activeJobs) {
    const s = job.status as string;
    if (!jobsByStatus[s]) continue;
    const client = job.client as Client | null;
    const clientName =
      client && typeof client === "object"
        ? [client.first_name, client.last_name].filter(Boolean).join(" ") || client.email
        : "Unknown";
    jobsByStatus[s].push({
      id: job.id,
      clientName,
      petNames: job.pets?.map((p) => p.name).join(", ") || "No pets listed",
      due_date: job.due_date ?? null,
      pics_received: job.pics_received ?? null,
      job_type: job.job_type ?? null,
      notes: job.notes ?? null,
      pinned: job.pinned ?? null,
      status: s,
    });
  }

  const columnData: JobColumnData[] = ACTIVE_STATUSES.map((status) => ({
    key: status,
    label: STATUS_META[status].label,
    color: STATUS_META[status].color,
    jobs: jobsByStatus[status],
  }));

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
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 px-2 pt-1">
      <div className="flex items-center gap-2 mb-1 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Jobs</span>
        <a
          href="/admin/collections/jobs/create"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
        >
          + Job
        </a>
        <a
          href="/admin/collections/clients/create"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
        >
          + Client
        </a>
        <a
          href="/dashboard/client-import"
          className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
        >
          Import CSV
        </a>
        <a
          href="/dashboard/organizations"
          className="text-xs px-2 py-0.5 border border-blue-300 rounded text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1"
        >
          Orgs
          {orgsNeedingFollowUp > 0 && (
            <span className="bg-red-500 text-white text-xs px-1 rounded-full leading-none py-0.5">
              {orgsNeedingFollowUp}
            </span>
          )}
        </a>
        <FullscreenButton />
      </div>

      <div className="flex-shrink-0">
        <StatsBar
          activeJobCount={activeJobs.length}
          needInfoCount={needInfoCount}
          drawnCount={drawnCount}
          feedbackCount={feedbackCount}
          totalClients={totalClients}
          overdueCount={staleJobs.length}
          orgsNeedingFollowUp={orgsNeedingFollowUp}
          topClients={topClients}
        />
        <OverdueAlert staleJobs={staleJobs} />
      </div>

      <div className="flex-shrink-0">
        <PinnedJobsBand jobs={pinnedItems} />
        <RecentJobsBand jobs={recentItems} />
      </div>

      <div className="flex-1 min-h-0">
        <JobsKanbanBoard columns={columnData} />
      </div>
    </div>
  );
}
