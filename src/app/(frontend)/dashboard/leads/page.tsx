import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Lead } from "@/payload-types";

const PIPELINE = [
  { value: "researched",        label: "Researched",        color: "gray"   },
  { value: "contacted",         label: "Contacted",         color: "blue"   },
  { value: "responded",         label: "Responded",         color: "yellow" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "purple" },
  { value: "confirmed",         label: "Confirmed",         color: "green"  },
  { value: "declined",          label: "Declined",          color: "red"    },
  { value: "no_response",       label: "No Response",       color: "orange" },
] as const;

const BORDER: Record<string, string> = {
  gray: "border-gray-300", blue: "border-blue-400", yellow: "border-yellow-400",
  purple: "border-purple-400", green: "border-green-400", red: "border-red-400", orange: "border-orange-400",
};
const BADGE: Record<string, string> = {
  gray: "bg-gray-100 text-gray-600", blue: "bg-blue-100 text-blue-700",
  yellow: "bg-yellow-100 text-yellow-700", purple: "bg-purple-100 text-purple-700",
  green: "bg-green-100 text-green-700", red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
};

export default async function LeadsDashboardPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  const { docs: leads } = await payload.find({
    collection: "leads",
    limit: 500,
    depth: 0,
    sort: "name",
  });

  const byStatus: Record<string, Lead[]> = {};
  for (const s of PIPELINE) byStatus[s.value] = [];
  for (const lead of leads) {
    const s = lead.status as string;
    if (byStatus[s]) byStatus[s].push(lead as Lead);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <a href="/dashboard" className="text-sm text-gray-500 hover:underline">
          &larr; Dashboard
        </a>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE.map(({ value, label, color }) => {
          const items = byStatus[value];
          return (
            <div key={value} className="flex-shrink-0 w-56">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE[color]}`}>
                  {label}
                </span>
                <span className="text-xs text-gray-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((lead) => {
                  const overdue =
                    lead.followUpDate &&
                    lead.followUpDate.slice(0, 10) <= today &&
                    !["confirmed", "declined"].includes(lead.status as string);
                  return (
                    <a
                      key={lead.id}
                      href={`/admin/collections/leads/${lead.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block bg-white border ${BORDER[color]} rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow`}
                    >
                      <p className="text-sm font-medium text-gray-900 leading-tight">{lead.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {lead.type?.replace("_", " ")}
                        {lead.neighborhood ? ` · ${lead.neighborhood}` : ""}
                      </p>
                      {lead.instagram && (
                        <p className="text-xs text-blue-500 mt-0.5">@{lead.instagram}</p>
                      )}
                      {lead.followUpDate && (
                        <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          Follow-up: {lead.followUpDate.slice(0, 10)}
                        </p>
                      )}
                      {lead.fitScore && (
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">
                          {lead.fitScore.replace("_", " ")}
                        </p>
                      )}
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
