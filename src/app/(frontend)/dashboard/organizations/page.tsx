export const metadata = { title: "Organizations" };

import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Organization } from "@/payload-types";
import { KanbanColumns, type OrgColumnData } from "./KanbanColumns";
import { DashboardNav } from "../components/DashboardNav";

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "contacted",            label: "Contacted",            color: "blue"   },
  { key: "opened_email",         label: "Opened Email",         color: "orange" },
  { key: "responded",            label: "Responded",            color: "yellow" },
  { key: "researched",           label: "Researched",           color: "gray"   },
  { key: "upcoming_event",       label: "Upcoming Event",       color: "green"  },
  { key: "ongoing_relationship", label: "Ongoing Relationship", color: "teal"   },
  { key: "past_collaborator",    label: "Past Collaborators",   color: "purple" },
  { key: "other",                label: "Other",                color: "slate"  },
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
    if (byCol[s] !== undefined) {
      byCol[s].push(org);
    } else {
      byCol["other"].push(org);
    }
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
    notes: org.notes ?? null,
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
      <DashboardNav
        section="organizations"
        quickCreate={[
          { label: "+ Org", href: "/admin/collections/organizations/create" },
        ]}
        importHref="/dashboard/brevo-org-import"
      />

      <KanbanColumns columns={columnData} today={today} />
    </div>
  );
}
