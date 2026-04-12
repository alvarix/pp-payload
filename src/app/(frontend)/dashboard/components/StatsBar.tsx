interface StatsBarProps {
  activeJobCount: number;
  totalClients: number;
  overdueCount: number;
  leadsNeedingFollowUp: number;
  statusCounts: Record<string, number>;
  tagCounts: Record<string, number>;
}

/**
 * Top stats bar showing key metrics at a glance.
 */
export function StatsBar({
  activeJobCount,
  totalClients,
  overdueCount,
  leadsNeedingFollowUp,
  tagCounts,
}: StatsBarProps) {
  // Top 5 tags by count
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <StatCard label="Active Jobs" value={activeJobCount} />
      <StatCard label="Total Clients" value={totalClients} />
      <StatCard
        label="Overdue"
        value={overdueCount}
        highlight={overdueCount > 0 ? "red" : undefined}
      />
      <StatCard
        label="Follow-ups Due"
        value={leadsNeedingFollowUp}
        highlight={leadsNeedingFollowUp > 0 ? "amber" : undefined}
      />
      {topTags.map(([tag, count]) => (
        <StatCard key={tag} label={tag} value={count} />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "red" | "amber";
}) {
  const borderColor =
    highlight === "red"
      ? "border-red-400"
      : highlight === "amber"
        ? "border-amber-400"
        : "border-gray-200";

  return (
    <div className={`border ${borderColor} rounded-lg p-3 bg-white shadow-sm`}>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
