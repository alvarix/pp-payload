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
  { name: "Email",    note: "Optional. A placeholder address is generated if omitted." },
  { name: "First",    note: "Client first name. Matched case-insensitively with Last. Client is created if not found." },
  { name: "Last",     note: "Client last name. Matched case-insensitively with First." },
  { name: "Pet",      note: "Pet name." },
  { name: "Breed",    note: "Pet breed." },
  { name: "Event",    note: "Matched by name to existing Event records. Not created if missing." },
  { name: "Type",     note: "street or studio. Defaults to street. Due date = today + 7 days (street) or + 10 days (studio)." },
  { name: "Status",   note: "Optional override. Valid: new, intake_received, in_progress, awaiting_pics_or_payment, ready_to_ship, delivered. Defaults to new." },
  { name: "Job Notes",    note: "Saved to the job record." },
  { name: "Client Notes", note: "Saved to the client record." },
  { name: "Referral",     note: "How the client heard about you — saved to the job record." },
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
    <div className="p-6 max-w-[800px] mx-auto">
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
