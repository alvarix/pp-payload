import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { ImportForm } from "./ImportForm";

/**
 * CSV import page for post-event client intake.
 * Accepts a CSV with columns: First, Last, Email, Pet, Breed, Date, Event, Type.
 * Creates or matches Clients and creates Jobs.
 */
export default async function ImportPage() {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers });
  if (!user) redirect("/admin/login");

  // Fetch events for the dropdown (to show available event names)
  const { docs: events } = await payload.find({
    collection: "events",
    limit: 50,
    sort: "-startAt",
  });

  const eventNames = events.map((e) => e.title);

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Dashboard
        </a>
        <h1 className="text-2xl font-bold text-gray-900">Import CSV</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-800 mb-2">Expected CSV columns</h2>
        <div className="grid grid-cols-4 gap-2 text-sm">
          {["First", "Last", "Email", "Pet", "Breed", "Date", "Event", "Type", "Status"].map((col) => (
            <code
              key={col}
              className="bg-gray-100 px-2 py-1 rounded text-gray-700"
            >
              {col}
            </code>
          ))}
        </div>
        <ul className="mt-3 text-sm text-gray-500 space-y-1 list-disc list-inside">
          <li>Clients matched by first + last name (case-insensitive). Created if not found.</li>
          <li>Email is optional — a placeholder is generated if omitted.</li>
          <li>Event matched by name to existing Event records. Not created if missing.</li>
          <li>Type: <code className="bg-gray-100 px-1 rounded">street</code> or <code className="bg-gray-100 px-1 rounded">studio</code>. Defaults to street. Due date is calculated as event date + 7 days (street) or + 10 days (studio).</li>
          <li>Date is the event date. Due date is calculated from it. Blank defaults to today.</li>
          <li>Status overrides the auto-detected value. Valid values: <code className="bg-gray-100 px-1 rounded">new</code>, <code className="bg-gray-100 px-1 rounded">intake_received</code>, <code className="bg-gray-100 px-1 rounded">in_progress</code>, <code className="bg-gray-100 px-1 rounded">awaiting_pics_or_payment</code>, <code className="bg-gray-100 px-1 rounded">ready_to_ship</code>, <code className="bg-gray-100 px-1 rounded">delivered</code>. If blank, defaults to <code className="bg-gray-100 px-1 rounded">delivered</code> for past dates and <code className="bg-gray-100 px-1 rounded">new</code> for future dates.</li>
          <li>Wrap any field in double quotes if it contains a comma: <code className="bg-gray-100 px-1 rounded">"Buddy, Jr."</code></li>
          <li>Run Preview first — no data is written until you click Import.</li>
        </ul>
      </div>

      {eventNames.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-700">
          <strong>Available event names:</strong>{" "}
          {eventNames.join(", ")}
        </div>
      )}

      <ImportForm />
    </div>
  );
}
