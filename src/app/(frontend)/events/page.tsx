import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Fetches and displays all published events
 */
export default async function EventsPage() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { docs: events } = await payload.find({
    collection: "events",
    where: {
      status: { equals: "published" },
    },
    sort: "-startAt", // newest first
    limit: 100,
  });
  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      <h1 className="text-3xl font-bold mb-6">Events</h1>

      {events.length === 0 && (
        <p className="text-gray-500 italic">No events scheduled yet.</p>
      )}

      {/* Using grid-cols-1 md:grid-cols-2 if you want it to be responsive */}
      <div className="grid gap-8">
        {events.map((event) => (
          <article
            key={event.id}
            className="border border-gray-200 p-6 rounded-lg shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              <a
                href={`/events/${event.slug}`}
                className="text-blue-600 hover:underline"
              >
                {event.title}
              </a>
            </h2>

            <div className="text-gray-600 mb-4">
              <time>
                {new Date(event.startAt).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              {event.endAt && (
                <>
                  {" "}
                  -{" "}
                  {new Date(event.endAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </>
              )}
            </div>

            {event.location?.address && (
              <p className="text-gray-600">📍 {event.location.address}</p>
            )}

            {event.featured && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm inline-block mt-2">
                Featured
              </span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
