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
 * POST /api/dashboard/client-import
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

  // Fetch all events and organizations once for matching
  const { docs: events } = await payload.find({
    collection: "events",
    limit: 100,
  });
  const { docs: organizations } = await payload.find({
    collection: "organizations",
    limit: 200,
  });

  const stats = {
    clientsCreated: 0,
    clientsMatched: 0,
    jobsCreated: 0,
    eventsMatched: new Set<string>(),
    eventsMissed: new Set<string>(),
    skipped: 0,
    errors: [] as string[],
    rows: [] as { name: string; pet: string; event: string; venue: string; jobType: string; status: string; action: string }[],
  };

  for (const row of rows) {
    const first = row["First"] || row["first"] || "";
    const last = row["Last"] || row["last"] || "";
    const pet = row["Pet"] || row["pet"] || "";
    const breed = row["Breed"] || row["breed"] || "";
    const petSexRaw = (row["Sex"] || row["sex"] || "").toLowerCase().trim();
    const petSex = ["male", "female", "unknown"].includes(petSexRaw) ? petSexRaw : undefined;
    const petAge = row["Age"] || row["age"] || "";
    const eventName = row["Event"] || row["event"] || "";
    const venueName = row["Venue"] || row["venue"] || "";
    const email = row["Email"] || row["email"] || "";
    const jobTypeRaw = (row["Type"] || row["type"] || "street").toLowerCase().trim();
    const jobType = jobTypeRaw === "studio" ? "studio" : "street";
    const statusOverride = (row["Status"] || row["status"] || "").toLowerCase().trim();
    const jobNotes = row["Job Notes"] || row["job notes"] || "";
    const clientNotes = row["Client Notes"] || row["client notes"] || "";
    const referral = row["Referral"] || row["referral"] || "";

    if (!first && !last && !pet && !email) {
      stats.skipped++;
      continue;
    }

    const fullName = [first, last].filter(Boolean).join(" ");

    // Due date = today + shipping window
    const shippingDays = jobType === "studio" ? 10 : 7;
    const due = new Date();
    due.setDate(due.getDate() + shippingDays);
    const parsedDate = due.toISOString();

    const VALID_STATUSES = ["inquiry", "intake_received", "in_progress", "awaiting_pics_or_payment", "ready_to_ship", "delivered", "portfolio_ready"];
    let jobStatus = "inquiry";
    if (statusOverride && VALID_STATUSES.includes(statusOverride)) {
      jobStatus = statusOverride;
    }

    let matchedEventName = "";
    let matchedEventId: number | undefined;
    if (eventName) {
      const match = events.find((e) =>
        e.title.toLowerCase().includes(eventName.toLowerCase()) ||
        eventName.toLowerCase().includes(e.title.toLowerCase())
      );
      if (match) {
        matchedEventName = match.title;
        matchedEventId = match.id;
        stats.eventsMatched.add(match.title);
      } else {
        stats.eventsMissed.add(eventName);
      }
    }

    let matchedOrgId: number | undefined;
    if (venueName) {
      const match = organizations.find((o) =>
        (o.name as string).toLowerCase().includes(venueName.toLowerCase()) ||
        venueName.toLowerCase().includes((o.name as string).toLowerCase())
      );
      if (match) matchedOrgId = match.id;
    }

    const rowSummary = {
      name: fullName || email || "(no name)",
      pet: pet || "",
      event: matchedEventName || eventName || "",
      venue: venueName || "",
      jobType,
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
      let clientId: number | undefined;

      // 1) Match by email first (most reliable identity key).
      if (email) {
        const { docs: byEmail } = await payload.find({
          collection: "clients",
          where: { email: { equals: email } },
          limit: 1,
        });
        if (byEmail.length > 0) {
          clientId = byEmail[0].id;
          stats.clientsMatched++;
          rowSummary.action = "client matched";
        }
      }

      // 2) Fall back to name matching when no email match was found.
      if (clientId === undefined && (first || last)) {
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
        }
      }

      // 3) Create a client when nothing matched. Requires email or a name.
      if (clientId === undefined) {
        if (!email && !first && !last) {
          stats.skipped++;
          continue;
        }
        const created = await payload.create({
          collection: "clients",
          data: {
            first_name: first,
            last_name: last,
            email: email || `import-${Date.now()}-${Math.random().toString(36).slice(2)}@placeholder.local`,
            notes: clientNotes || undefined,
          },
        });
        clientId = created.id;
        stats.clientsCreated++;
        rowSummary.action = "client created";
      }

      await payload.create({
        collection: "jobs",
        data: {
          client: clientId,
          status: jobStatus as any,
          job_type: jobType as any,
          due_date: parsedDate,
          notes: jobNotes || undefined,
          referral: referral || undefined,
          event: matchedEventId,
          organization: matchedOrgId,
          pets: [{ name: pet || "Unknown", breed: breed || "", sex: petSex as any, age: petAge || undefined }],
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
