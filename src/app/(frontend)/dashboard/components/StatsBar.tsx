interface TopClient {
  name: string;
  jobCount: number;
  id: number;
}

interface StatsBarProps {
  activeJobCount: number;
  drawnCount: number;
  feedbackCount: number;
  totalClients: number;
  overdueCount: number;
  leadsNeedingFollowUp: number;
  topClients: TopClient[];
}

/**
 * Top stats bar showing key metrics at a glance.
 * Each stat card is a link to the relevant filtered admin view.
 */
export function StatsBar({
  activeJobCount,
  drawnCount,
  feedbackCount,
  totalClients,
  overdueCount,
  leadsNeedingFollowUp,
  topClients,
}: StatsBarProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Active Jobs"
          value={activeJobCount}
          href="/admin/collections/jobs"
        />
        <StatCard
          label="Drawn / To Deliver"
          value={drawnCount}
          href="/admin/collections/jobs?where[status][equals]=ready_to_ship"
          highlight={drawnCount > 0 ? "purple" : undefined}
        />
        <StatCard
          label="Awaiting Feedback"
          value={feedbackCount}
          href="/admin/collections/jobs?where[status][equals]=delivered"
          highlight={feedbackCount > 5 ? "amber" : undefined}
        />
        <StatCard
          label="Overdue / Stale"
          value={overdueCount}
          highlight={overdueCount > 0 ? "red" : undefined}
        />
        <StatCard
          label="Follow-ups Due"
          value={leadsNeedingFollowUp}
          href="/admin/collections/leads"
          highlight={leadsNeedingFollowUp > 0 ? "amber" : undefined}
        />
      </div>

      {topClients.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wide self-center">
            Most jobs:
          </span>
          {topClients.map((c) => (
            <a
              key={c.id}
              href={`/admin/collections/clients/${c.id}`}
              className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm hover:border-blue-400 hover:text-blue-700 text-gray-700"
            >
              {c.name} <span className="font-semibold">{c.jobCount}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: "red" | "amber" | "purple";
  href?: string;
}) {
  const borderColor =
    highlight === "red"
      ? "border-red-400"
      : highlight === "amber"
        ? "border-amber-400"
        : highlight === "purple"
          ? "border-purple-400"
          : "border-gray-200";

  const content = (
    <div className={`border ${borderColor} rounded-lg p-3 bg-white shadow-sm h-full`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-80 transition-opacity"
      >
        {content}
      </a>
    );
  }

  return content;
}
