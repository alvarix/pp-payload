interface TopClient {
  name: string;
  jobCount: number;
  id: number;
}

interface StatsBarProps {
  activeJobCount: number;
  needInfoCount: number;
  drawnCount: number;
  feedbackCount: number;
  totalClients: number;
  overdueCount: number;
  orgsNeedingFollowUp: number;
  topClients: TopClient[];
}

/**
 * Top stats bar — four primary stats + top clients by job count.
 * Each stat card links to the relevant admin filtered view.
 */
export function StatsBar({
  activeJobCount,
  needInfoCount,
  drawnCount,
  feedbackCount,
  totalClients,
  overdueCount,
  orgsNeedingFollowUp,
  topClients,
}: StatsBarProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Active"
          value={activeJobCount}
          href="/admin/collections/jobs"
          description="Jobs in progress"
        />
        <StatCard
          label="Need Info"
          value={needInfoCount}
          href="/admin/collections/jobs?where[status][equals]=awaiting_pics_or_payment"
          highlight={needInfoCount > 0 ? "amber" : undefined}
          description="Awaiting pics or payment"
        />
        <StatCard
          label="To Deliver"
          value={drawnCount}
          href="/admin/collections/jobs?where[status][equals]=ready_to_ship"
          highlight={drawnCount > 0 ? "purple" : undefined}
          description="Ready to ship"
        />
        <StatCard
          label="Feedback"
          value={feedbackCount}
          href="/admin/collections/jobs?where[portfolio.testimonial][exists]=true"
          description="Clients who gave feedback"
        />
      </div>

      {/* Secondary row */}
      <div className="flex gap-3 flex-wrap items-center">
        <StatPill label="Clients" value={totalClients} />
        {overdueCount > 0 && (
          <StatPill label="Stale" value={overdueCount} color="red" />
        )}
        {orgsNeedingFollowUp > 0 && (
          <a href="/admin/collections/organizations" target="_blank" rel="noopener noreferrer">
            <StatPill label="Follow-ups due" value={orgsNeedingFollowUp} color="amber" />
          </a>
        )}

        {topClients.length > 0 && (
          <>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">Most jobs:</span>
            {topClients.map((c) => (
              <a
                key={c.id}
                href={`/admin/collections/clients/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1 bg-white border border-gray-200 rounded-full shadow-sm hover:border-blue-400 hover:text-blue-700 text-gray-700"
              >
                {c.name} <span className="font-semibold">{c.jobCount}</span>
              </a>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  href,
  description,
}: {
  label: string;
  value: number;
  highlight?: "red" | "amber" | "purple";
  href?: string;
  description?: string;
}) {
  const borderColor =
    highlight === "red"
      ? "border-red-400"
      : highlight === "amber"
        ? "border-amber-400"
        : highlight === "purple"
          ? "border-purple-400"
          : "border-gray-200";

  const inner = (
    <div className={`border ${borderColor} rounded px-3 py-1.5 bg-white shadow-sm flex items-center gap-2`}>
      <span className="text-lg font-bold text-gray-900 leading-none">{value}</span>
      <div className="min-w-0">
        <p className="!m-1 text-xs text-gray-600 font-medium leading-none truncate">{label}</p>
        {description && (
          <p className="!m-1 text-xs text-gray-500 leading-none truncate mt-0.5">{description}</p>
        )}
      </div>
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
        {inner}
      </a>
    );
  }
  return inner;
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: "red" | "amber";
}) {
  const cls =
    color === "red"
      ? "bg-red-100 text-red-700 border-red-200"
      : color === "amber"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`text-xs px-3 py-1 rounded-full border ${cls}`}>
      {label}: <strong>{value}</strong>
    </span>
  );
}
