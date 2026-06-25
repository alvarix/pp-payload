export const metadata = { title: "Client Import" };

import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { ImportForm } from "./ImportForm";
import type { ColumnDef } from "./ImportForm";

/**
 * Per-column definitions — name maps to the CSV header, note appears on hover.
 */
const COLUMN_DEFS: ColumnDef[] = [
  { name: "Email",        note: "Client email. Used as the primary identity key — matched against existing clients before creating a new one." },
  { name: "First",        note: "Client first name. Matched with Last when no email match exists.", excludeByDefault: true },
  { name: "Last",         note: "Client last name.", excludeByDefault: true },
  { name: "Pet",          note: "Pet name.", excludeByDefault: true },
  { name: "Breed",        note: "Pet breed.", excludeByDefault: true },
  { name: "Sex",          note: "Pet sex. Accepted values: male, female, unknown.", excludeByDefault: true },
  { name: "Age",          note: "Pet age. Free text, e.g. 3 years or 6 months.", excludeByDefault: true },
  { name: "Event",        note: "Matched by name to existing Event records. Not created if missing.", excludeByDefault: true },
  { name: "Venue",        note: "Matched by name to existing Organization records. Not created if missing." },
  { name: "Type",         note: "street or studio. Defaults to street. Due date = today + 7 days (street) or + 10 days (studio)." },
  { name: "Status",       note: "Optional override. Valid: inquiry, intake_received, in_progress, awaiting_pics_or_payment, ready_to_ship, delivered, portfolio_ready. Defaults to inquiry." },
  { name: "Job Notes",    note: "Saved to the job record.", excludeByDefault: true },
  { name: "Client Notes", note: "Saved to the client record.", excludeByDefault: true },
  { name: "Referral",     note: "How the client heard about you — saved to the job record.", excludeByDefault: true },
];

/**
 * CSV import page for post-event client intake.
 * Accepts a CSV with columns matching COLUMN_DEFS.
 * Creates or matches Clients and creates Jobs.
 */
export default async function ClientImportPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  const { docs: events } = await payload.find({
    collection: "events",
    limit: 50,
    sort: "-startAt",
  });

  const eventNames = events.map((e) => e.title);

  return (
    <div className="p-6 max-w-[800px] mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Dashboard
        </a>
        <h1 className="text-2xl font-bold text-gray-900">Import Clients</h1>
      </div>

      <ImportForm columnDefs={COLUMN_DEFS} eventNames={eventNames} />
    </div>
  );
}
