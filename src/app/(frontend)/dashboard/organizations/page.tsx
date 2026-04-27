import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Organization } from "@/payload-types";
import { KanbanColumns, type OrgColumnData } from "./KanbanColumns";

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "contacted",            label: "Contacted",            color: "blue"   },
  { key: "responded",            label: "Responded",            color: "yellow" },
  { key: "researched",           label: "Researched",           color: "gray"   },
  { key: "upcoming_event",       label: "Upcoming Event",       color: "green"  },
  { key: "ongoing_relationship", label: "Ongoing Relationship", color: "teal"   },
  { key: "past_collaborator",    label: "Past Collaborators",   color: "purple" },
];

export default async function OrganizationsDashboardPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  const { docs: organizations } = await payload.find({
    collection: "organizations",
    limit: 500,
    depth: 0,
    sort: "name",
  });

  const byCol: Record<string, Organization[]> = { top_tier: [] };
  for (const c of COLUMNS) byCol[c.key] = [];

  for (const org of organizations as Organization[]) {
    const s = org.status as string;
    if (org.fitScore === "top_tier") byCol["top_tier"].push(org);
    if (byCol[s] !== undefined) byCol[s].push(org);
  }

  const pickFields = (org: Organization) => ({
    id: org.id,
    name: org.name,
    type: org.type ?? null,
    neighborhood: org.neighborhood ?? null,
    instagram: org.instagram ?? null,
    website: org.website ?? null,
    email: org.email ?? null,
    phone: org.phone ?? null,
    contacts: Array.isArray(org.contacts)
      ? org.contacts.map((c) => ({
          contactName: c.contactName ?? null,
          role: c.role ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
        }))
      : null,
    fitScore: org.fitScore ?? null,
    followUpDate: org.followUpDate ?? null,
    status: org.status as string,
    state: org.state ?? null,
  });

  const columnData: OrgColumnData[] = [
    { key: "top_tier", label: "Top Tier", color: "amber", isBand: true, orgs: byCol["top_tier"].map(pickFields) },
    ...COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      color: c.color,
      orgs: byCol[c.key].map(pickFields),
    })),
  ];

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-6 max-w-[1400px] mx-auto bg-gray-50 min-h-screen">
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
          <a
            href="/dashboard/brevo-org-import"
            className="text-sm px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Import Brevo CSV
          </a>
          <a href="/dashboard" className="text-sm text-gray-500 hover:underline">
            &larr; Dashboard
          </a>
        </div>
      </div>

      <KanbanColumns columns={columnData} today={today} />
    </div>
  );
}
