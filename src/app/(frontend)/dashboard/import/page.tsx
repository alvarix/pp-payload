import { headers as getHeaders } from "next/headers.js";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { ImportForm } from "./ImportForm";

/**
 * CSV import page for post-event client intake.
 * Accepts a CSV with columns: First, Last, Pet, Breed, Date, Event.
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
        <div className="grid grid-cols-3 gap-2 text-sm">
          {["First", "Last", "Pet", "Breed", "Date", "Event"].map((col) => (
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
          <li>Event matched by name to existing Event records. Not created if missing.</li>
          <li>Date sets the job due date. Status is set to <code className="bg-gray-100 px-1 rounded">delivered</code> if the date is in the past.</li>
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
