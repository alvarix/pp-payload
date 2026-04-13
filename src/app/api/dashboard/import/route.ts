import { headers as getHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Parses CSV text into rows of key-value objects.
 * Handles quoted fields containing commas.
 * @param text - raw CSV string
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * POST /api/dashboard/import
 * Body: { csv: string, dryRun: boolean }
 * Processes a CSV with columns: First, Last, Email, Pet, Breed, Date, Event, Type, Status
 * Creates/matches Clients and creates Jobs.
 */
export async function POST(request: Request) {
  const headers = await getHeaders();
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { csv, dryRun } = body as { csv: string; dryRun: boolean };

  if (!csv?.trim()) {
    return Response.json({ error: "No CSV content provided" }, { status: 400 });
  }

  const rows = parseCSV(csv);
  if (rows.length === 0) {
    return Response.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  // Fetch all events once for matching
  const { docs: events } = await payload.find({
    collection: "events",
    limit: 100,
  });

  const stats = {
    clientsCreated: 0,
    clientsMatched: 0,
    jobsCreated: 0,
    eventsMatched: new Set<string>(),
    eventsMissed: new Set<string>(),
    skipped: 0,
    errors: [] as string[],
    rows: [] as { name: string; pet: string; event: string; status: string; action: string }[],
  };

  for (const row of rows) {
    const first = row["First"] || row["first"] || "";
    const last = row["Last"] || row["last"] || "";
    const pet = row["Pet"] || row["pet"] || "";
    const breed = row["Breed"] || row["breed"] || "";
    const dateStr = row["Date"] || row["date"] || "";
    const eventName = row["Event"] || row["event"] || "";
    const email = row["Email"] || row["email"] || "";
    const jobTypeRaw = (row["Type"] || row["type"] || "street").toLowerCase().trim();
    const jobType = jobTypeRaw === "studio" ? "studio" : "street";
    const statusOverride = (row["Status"] || row["status"] || "").toLowerCase().trim();

    // Skip rows missing both name and pet
    if (!first && !last && !pet) {
      stats.skipped++;
      continue;
    }

    const fullName = [first, last].filter(Boolean).join(" ");

    // Determine job status based on date
    let jobStatus = "new";
    let parsedDate: string | undefined;

    const eventDate = new Date(dateStr || new Date().toDateString());
    if (!isNaN(eventDate.getTime())) {
      // Add shipping window to event date: street = 7 days, studio = 10 days
      const shippingDays = jobType === "studio" ? 10 : 7;
      const due = new Date(eventDate);
      due.setDate(due.getDate() + shippingDays);
      parsedDate = due.toISOString();
      jobStatus = eventDate < new Date() ? "delivered" : "new";
    }

    const VALID_STATUSES = ["new", "intake_received", "in_progress", "awaiting_pics_or_payment", "ready_to_ship", "delivered"];
    if (statusOverride && VALID_STATUSES.includes(statusOverride)) {
      jobStatus = statusOverride;
    }


    // Match event by title (case-insensitive, partial)
    let matchedEventName = "";
    if (eventName) {
      const match = events.find((e) =>
        e.title.toLowerCase().includes(eventName.toLowerCase()) ||
        eventName.toLowerCase().includes(e.title.toLowerCase())
      );
      if (match) {
        matchedEventName = match.title;
        stats.eventsMatched.add(match.title);
      } else {
        stats.eventsMissed.add(eventName);
      }
    }

    const rowSummary = {
      name: fullName || "(no name)",
      pet: pet || "(no pet)",
      event: matchedEventName || eventName || "",
      status: jobStatus,
      action: "",
    };

    if (dryRun) {
      rowSummary.action = "would create";
      stats.rows.push(rowSummary);
      stats.jobsCreated++;
      continue;
    }

    try {
      // Find or create client by first+last name
      let clientId: number;

      if (first || last) {
        const searchName = fullName.toLowerCase();
        const { docs: existing } = await payload.find({
          collection: "clients",
          where: {
            and: [
              { first_name: { like: first || "" } },
              { last_name: { like: last || "" } },
            ],
          },
          limit: 5,
        });

        const match = existing.find(
          (c) =>
            [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase() ===
            searchName
        );

        if (match) {
          clientId = match.id;
          stats.clientsMatched++;
          rowSummary.action = "client matched";
        } else {
          const created = await payload.create({
            collection: "clients",
            data: {
              first_name: first,
              last_name: last,
              email: email || `import-${Date.now()}-${Math.random().toString(36).slice(2)}@placeholder.local`,
            },
          });
          clientId = created.id;
          stats.clientsCreated++;
          rowSummary.action = "client created";
        }
      } else {
        stats.skipped++;
        continue;
      }

      // Create job
      await payload.create({
        collection: "jobs",
        data: {
          client: clientId,
          status: jobStatus as any,
          job_type: jobType as any,
          due_date: parsedDate,
          notes: eventName ? `Event: ${eventName}` : undefined,
          pets: [{ name: pet || "Unknown", breed: breed || "" }],
        },
      });

      stats.jobsCreated++;
      stats.rows.push(rowSummary);
    } catch (e: any) {
      stats.errors.push(`Row "${fullName}": ${e.message}`);
      rowSummary.action = "error";
      stats.rows.push(rowSummary);
    }
  }

  return Response.json({
    clientsCreated: stats.clientsCreated,
    clientsMatched: stats.clientsMatched,
    jobsCreated: stats.jobsCreated,
    eventsMatched: Array.from(stats.eventsMatched),
    eventsMissed: Array.from(stats.eventsMissed),
    skipped: stats.skipped,
    errors: stats.errors,
    rows: stats.rows,
  });
}
