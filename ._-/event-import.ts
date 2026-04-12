/**
 * Event CSV importer
 * Reads a CSV of post-event client data and creates Client + Job records.
 * Matches events by title (case-insensitive partial match).
 * Matches clients by first_name + last_name (case-insensitive).
 *
 * Usage:
 *   pnpm tsx ._-/event-import.ts data_import/my-event.csv
 *   pnpm tsx ._-/event-import.ts data_import/my-event.csv --dry-run
 *
 * Env vars:
 *   PAYLOAD_ADMIN_EMAIL    (required)
 *   PAYLOAD_ADMIN_PASSWORD (required)
 *   PAYLOAD_URL            (default: http://localhost:3001)
 */

import fs from "fs";
import path from "path";

// --- Config ---

const PAYLOAD_URL = process.env.PAYLOAD_URL ?? "http://localhost:3001";
const ADMIN_EMAIL = process.env.PAYLOAD_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD;

// --- Types ---

interface CSVRow {
  First: string;
  Last: string;
  Pet: string;
  Breed: string;
  Date: string;
  Event: string;
}

interface Report {
  clientsCreated: number;
  clientsMatched: number;
  jobsCreated: number;
  eventsMatched: number;
  eventsNotFound: string[];
  rowsSkipped: number;
  skippedReasons: string[];
}

// --- CSV parser (same pattern as import-dry-run.ts) ---

/**
 * Parses raw CSV text into rows of string arrays.
 * Handles quoted fields with commas and newlines inside.
 * @param raw - raw CSV file contents
 * @returns array of rows, each row an array of field strings
 */
function parseCSV(raw: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      current.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      if (current.length > 0 || field.length > 0) {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      }
    } else {
      field += ch;
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

/**
 * Converts parsed CSV rows into objects using the header row as keys.
 * @param rows - parsed CSV rows from parseCSV
 * @returns array of objects keyed by header names
 */
function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] ?? "").trim();
    });
    return obj;
  });
}

// --- Date parsing ---

/**
 * Attempts to parse a date string into ISO format.
 * Handles common formats: MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY, etc.
 * @param raw - raw date string from CSV
 * @returns ISO date string or null if unparseable
 */
function parseDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

// --- Auth ---

/**
 * Logs in to Payload CMS and returns a JWT token.
 * @param email - admin email
 * @param password - admin password
 * @returns JWT token string
 */
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${PAYLOAD_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.token;
}

// --- API helpers ---

/**
 * Fetches all events from the API.
 * @param token - JWT auth token
 * @returns array of event objects
 */
async function fetchEvents(token: string): Promise<any[]> {
  const res = await fetch(`${PAYLOAD_URL}/api/events?limit=500&depth=0`, {
    headers: { Authorization: `JWT ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  const data = await res.json();
  return data.docs;
}

/**
 * Fetches all clients from the API.
 * @param token - JWT auth token
 * @returns array of client objects
 */
async function fetchClients(token: string): Promise<any[]> {
  const res = await fetch(`${PAYLOAD_URL}/api/clients?limit=5000&depth=0`, {
    headers: { Authorization: `JWT ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch clients: ${res.status}`);
  const data = await res.json();
  return data.docs;
}

/**
 * Creates a client via the REST API.
 * @param token - JWT auth token
 * @param data - client fields
 * @returns created client object
 */
async function createClient(
  token: string,
  data: Record<string, any>
): Promise<any> {
  const res = await fetch(`${PAYLOAD_URL}/api/clients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `JWT ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create client: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Creates a job via the REST API.
 * @param token - JWT auth token
 * @param data - job fields
 * @returns created job object
 */
async function createJob(
  token: string,
  data: Record<string, any>
): Promise<any> {
  const res = await fetch(`${PAYLOAD_URL}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `JWT ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create job: ${res.status} ${text}`);
  }
  return res.json();
}

// --- Matching ---

/**
 * Finds a client by first + last name (case-insensitive).
 * @param clients - array of existing client objects
 * @param first - first name to match
 * @param last - last name to match
 * @returns matched client or undefined
 */
function findClientByName(
  clients: any[],
  first: string,
  last: string
): any | undefined {
  const f = first.toLowerCase().trim();
  const l = last.toLowerCase().trim();
  return clients.find(
    (c) =>
      (c.first_name ?? "").toLowerCase().trim() === f &&
      (c.last_name ?? "").toLowerCase().trim() === l
  );
}

/**
 * Finds an event by title (case-insensitive partial match).
 * @param events - array of existing event objects
 * @param eventName - event name string from CSV
 * @returns matched event or undefined
 */
function findEventByTitle(
  events: any[],
  eventName: string
): any | undefined {
  const needle = eventName.toLowerCase().trim();
  if (!needle) return undefined;
  return events.find((e) =>
    (e.title ?? "").toLowerCase().includes(needle)
  );
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const csvPath = args.find((a) => !a.startsWith("--"));

  if (!csvPath) {
    console.error("Usage: pnpm tsx ._-/event-import.ts <csv-path> [--dry-run]");
    process.exit(1);
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      "Set PAYLOAD_ADMIN_EMAIL and PAYLOAD_ADMIN_PASSWORD env vars"
    );
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  const rows = rowsToObjects(parseCSV(raw));

  if (rows.length === 0) {
    console.log("No data rows found in CSV.");
    return;
  }

  console.log(`\n=== EVENT IMPORT ${dryRun ? "(DRY RUN)" : "(LIVE)"} ===\n`);
  console.log(`CSV: ${resolved}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Server: ${PAYLOAD_URL}\n`);

  // Auth
  const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Logged in.\n");

  // Fetch existing data
  const [existingEvents, existingClients] = await Promise.all([
    fetchEvents(token),
    fetchClients(token),
  ]);
  console.log(
    `Existing: ${existingClients.length} clients, ${existingEvents.length} events\n`
  );

  // Keep a local cache of clients we create during this run
  const localClients = [...existingClients];

  const report: Report = {
    clientsCreated: 0,
    clientsMatched: 0,
    jobsCreated: 0,
    eventsMatched: 0,
    eventsNotFound: [],
    rowsSkipped: 0,
    skippedReasons: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2; // 1-indexed, skip header
    const first = row["First"] ?? "";
    const last = row["Last"] ?? "";
    const pet = row["Pet"] ?? "";
    const breed = row["Breed"] ?? "";
    const dateStr = row["Date"] ?? "";
    const eventName = row["Event"] ?? "";

    // Validate required fields
    if (!first.trim() || !pet.trim()) {
      report.rowsSkipped++;
      report.skippedReasons.push(
        `Row ${lineNum}: missing First or Pet (First="${first}", Pet="${pet}")`
      );
      continue;
    }

    // Match or create client
    let client = findClientByName(localClients, first, last);
    let clientAction: string;

    if (client) {
      report.clientsMatched++;
      clientAction = `matched (id: ${client.id})`;
    } else {
      // Generate a placeholder email since email is required+unique
      const slug = `${first.toLowerCase().replace(/\s+/g, "")}.${last.toLowerCase().replace(/\s+/g, "") || "unknown"}`;
      const placeholderEmail = `${slug}+event@placeholder.local`;

      const clientData = {
        first_name: first.trim(),
        last_name: last.trim(),
        email: placeholderEmail,
        tags: [{ tag: "event" }],
      };

      if (dryRun) {
        clientAction = `would create (${first} ${last}, ${placeholderEmail})`;
        // Add a fake client to local cache so subsequent rows can match
        client = { id: `dry-${lineNum}`, ...clientData };
        localClients.push(client);
        report.clientsCreated++;
      } else {
        try {
          const created = await createClient(token, clientData);
          client = created.doc ?? created;
          localClients.push(client);
          report.clientsCreated++;
          clientAction = `created (id: ${client.id})`;
        } catch (err: any) {
          // If email collision, try to find existing
          if (err.message.includes("duplicate") || err.message.includes("unique")) {
            const existing = localClients.find(
              (c) => c.email === placeholderEmail
            );
            if (existing) {
              client = existing;
              report.clientsMatched++;
              clientAction = `matched by email fallback (id: ${client.id})`;
            } else {
              report.rowsSkipped++;
              report.skippedReasons.push(
                `Row ${lineNum}: client create failed: ${err.message}`
              );
              continue;
            }
          } else {
            report.rowsSkipped++;
            report.skippedReasons.push(
              `Row ${lineNum}: client create failed: ${err.message}`
            );
            continue;
          }
        }
      }
    }

    // Match event
    const event = findEventByTitle(existingEvents, eventName);
    let eventAction: string;
    if (event) {
      report.eventsMatched++;
      eventAction = `matched "${event.title}" (id: ${event.id})`;
    } else if (eventName.trim()) {
      if (!report.eventsNotFound.includes(eventName.trim())) {
        report.eventsNotFound.push(eventName.trim());
      }
      eventAction = `not found: "${eventName}"`;
    } else {
      eventAction = "none specified";
    }

    // Determine job status
    const parsedDate = parseDate(dateStr);
    const isPast = parsedDate ? new Date(parsedDate) < new Date() : false;
    const jobStatus = isPast ? "delivered" : "new";

    // Build job data
    const jobData: Record<string, any> = {
      client: client.id,
      status: jobStatus,
      pets: [{ name: pet.trim(), breed: breed.trim() || undefined }],
      notes: eventName.trim() ? `Event: ${eventName.trim()}` : undefined,
    };
    if (parsedDate) {
      jobData.due_date = parsedDate;
    }

    if (dryRun) {
      console.log(
        `  Row ${lineNum}: ${first} ${last} | ${pet} | ${dateStr} | ${eventName}`
      );
      console.log(`    Client: ${clientAction}`);
      console.log(`    Event:  ${eventAction}`);
      console.log(`    Job:    would create (status: ${jobStatus})`);
      console.log();
      report.jobsCreated++;
    } else {
      try {
        await createJob(token, jobData);
        report.jobsCreated++;
        console.log(`  Row ${lineNum}: ${first} ${last} | ${clientAction} | job created`);
      } catch (err: any) {
        report.rowsSkipped++;
        report.skippedReasons.push(
          `Row ${lineNum}: job create failed: ${err.message}`
        );
        console.log(`  Row ${lineNum}: FAILED - ${err.message}`);
      }
    }
  }

  // --- Report ---

  console.log("\n=== REPORT ===\n");
  console.log(`Clients matched:    ${report.clientsMatched}`);
  console.log(`Clients created:    ${report.clientsCreated}`);
  console.log(`Jobs created:       ${report.jobsCreated}`);
  console.log(`Events matched:     ${report.eventsMatched}`);
  console.log(`Rows skipped:       ${report.rowsSkipped}`);

  if (report.eventsNotFound.length > 0) {
    console.log(`\nEvents not found (no auto-create):`);
    report.eventsNotFound.forEach((e) => console.log(`  - ${e}`));
  }

  if (report.skippedReasons.length > 0) {
    console.log(`\nSkip reasons:`);
    report.skippedReasons.forEach((r) => console.log(`  ${r}`));
  }

  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
