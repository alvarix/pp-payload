import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Organization } from "@/payload-types";
import { KanbanColumns, type OrgColumnData } from "./KanbanColumns";
import { FullscreenButton } from "../components/FullscreenButton";

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "contacted",            label: "Contacted",            color: "blue"   },
  { key: "opened_email",         label: "Opened Email",         color: "orange" },
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

  const byCol: Record<string, Organization[]> = { top_tier: [], pinned: [] };
  for (const c of COLUMNS) byCol[c.key] = [];

  for (const org of organizations as Organization[]) {
    const s = org.status as string;
    if (org.pinned) byCol["pinned"].push(org);
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
    contactNotes: org.contactNotes ?? null,
    contacts: Array.isArray(org.contacts)
      ? org.contacts.map((c) => ({
          contactName: c.contactName ?? null,
          role: c.role ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          notes: c.notes ?? null,
        }))
      : null,
    fitScore: org.fitScore ?? null,
    pinned: org.pinned ?? null,
    followUpDate: org.followUpDate ?? null,
    status: org.status as string,
    state: org.state ?? null,
  });

  const columnData: OrgColumnData[] = [
    { key: "pinned", label: "Pinned", color: "rose", isBand: true, orgs: byCol["pinned"].map(pickFields) },
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
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 px-2 pt-1">
      <div className="flex items-center gap-2 mb-1 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Orgs</span>
        <a
          href="/admin/collections/organizations/create"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
        >
          + Org
        </a>
        <a
          href="/dashboard/brevo-org-import"
          className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100"
        >
          Import CSV
        </a>
        <a href="/dashboard" className="text-xs text-gray-400 hover:underline ml-auto">
          &larr; Back
        </a>
        <FullscreenButton />
      </div>

      <KanbanColumns columns={columnData} today={today} />
    </div>
  );
}
