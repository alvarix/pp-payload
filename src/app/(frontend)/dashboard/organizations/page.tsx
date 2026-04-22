import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Organization } from "@/payload-types";
import { OrgStatusSelect } from "./OrgStatusSelect";

/**
 * Virtual column keys — not all map 1:1 to organization status.
 * "current" = confirmed with upcoming event, "past" = confirmed without.
 */
const COLUMNS = [
  { key: "current",    label: "Current",          color: "green"  },
  { key: "past",       label: "Past Collaborators", color: "teal"  },
  { key: "researched", label: "Prospects",         color: "gray"   },
  { key: "contacted",  label: "Contacted",         color: "blue"   },
  { key: "responded",  label: "Responded",         color: "yellow" },
] as const;

const BORDER: Record<string, string> = {
  green:  "border-green-400",
  teal:   "border-teal-400",
  gray:   "border-gray-300",
  blue:   "border-blue-400",
  yellow: "border-yellow-400",
};

const BADGE: Record<string, string> = {
  green:  "bg-green-100 text-green-700",
  teal:   "bg-teal-100 text-teal-700",
  gray:   "bg-gray-100 text-gray-600",
  blue:   "bg-blue-100 text-blue-700",
  yellow: "bg-yellow-100 text-yellow-700",
};

/** Sort prospects by fit score: top_tier first */
const FIT_ORDER: Record<string, number> = { top_tier: 3, strong: 2, worth_trying: 1 };

export default async function OrganizationsDashboardPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  const [{ docs: organizations }, { docs: upcomingEvents }] = await Promise.all([
    payload.find({ collection: "organizations", limit: 500, depth: 0, sort: "name" }),
    payload.find({
      collection: "events",
      where: { startAt: { greater_than_equal: new Date().toISOString() } },
      limit: 100,
      depth: 0,
    }),
  ]);

  // Set of organization IDs that have at least one upcoming event
  const orgsWithUpcomingEvents = new Set(
    upcomingEvents
      .map((e) => (typeof e.organization === "object" ? e.organization?.id : e.organization))
      .filter(Boolean)
  );

  const byCol: Record<string, Organization[]> = {};
  for (const c of COLUMNS) byCol[c.key] = [];

  for (const org of organizations as Organization[]) {
    const s = org.status as string;
    if (s === "confirmed") {
      byCol[orgsWithUpcomingEvents.has(org.id) ? "current" : "past"].push(org);
    } else if (byCol[s]) {
      byCol[s].push(org);
    }
  }

  byCol["researched"].sort(
    (a, b) => (FIT_ORDER[b.fitScore ?? ""] ?? 0) - (FIT_ORDER[a.fitScore ?? ""] ?? 0)
  );

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-[1200px] mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
        <div className="flex items-center gap-2">
          <a
            href="/admin/collections/organizations/create"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            + Organization
          </a>
          <a href="/dashboard" className="text-sm text-gray-500 hover:underline">
            &larr; Dashboard
          </a>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        To move an organization between columns, open it in admin and change its Status.
        Confirmed organizations with an upcoming linked event appear in Current; others go to Past Collaborators.
      </p>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(({ key, label, color }) => {
          const items = byCol[key];
          const value = key;
          return (
            <div key={value} className="flex-shrink-0 w-60">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE[color]}`}>
                  {label}
                </span>
                <span className="text-xs text-gray-400">{items.length}</span>
              </div>

              <div className="space-y-2">
                {items.map((org) => {
                  const overdue =
                    org.followUpDate &&
                    org.followUpDate.slice(0, 10) <= today &&
                    !["current", "past"].includes(value);
                  return (
                    <a
                      key={org.id}
                      href={`/admin/collections/organizations/${org.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block bg-white border ${BORDER[color]} rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow`}
                    >
                      <p className="text-sm font-medium text-gray-900 leading-tight">{org.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {org.type?.replace(/_/g, " ")}
                        {org.neighborhood ? ` · ${org.neighborhood}` : ""}
                      </p>
                      {org.instagram && (
                        <p className="text-xs text-blue-500 mt-0.5">@{org.instagram}</p>
                      )}
                      {key === "researched" && org.fitScore && (
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">
                          {org.fitScore.replace(/_/g, " ")}
                        </p>
                      )}
                      {org.followUpDate && (
                        <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          Follow-up: {org.followUpDate.slice(0, 10)}
                        </p>
                      )}
                      <OrgStatusSelect orgId={org.id} currentStatus={org.status as string} />
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
