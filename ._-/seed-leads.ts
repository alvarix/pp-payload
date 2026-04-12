/**
 * Seed script for Leads collection.
 * Reads docs/outreach-leads-seed.json and POSTs each lead to the Payload REST API.
 * Idempotent: skips leads where a record with the same name already exists.
 *
 * Usage:
 *   pnpm tsx ._-/seed-leads.ts
 *
 * Requires env vars (or .env in project root):
 *   PAYLOAD_ADMIN_EMAIL    admin user email
 *   PAYLOAD_ADMIN_PASSWORD admin user password
 *   PAYLOAD_URL            defaults to http://localhost:3000
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.PAYLOAD_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.PAYLOAD_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.PAYLOAD_ADMIN_PASSWORD ?? "";

const SEED_FILE = path.resolve("docs/outreach-leads-seed.json");

let authToken = "";

/**
 * Logs in to Payload and stores the auth token.
 */
async function login(): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Missing PAYLOAD_ADMIN_EMAIL or PAYLOAD_ADMIN_PASSWORD env vars"
    );
  }
  const res = await fetch(`${BASE_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = (await res.json()) as any;
  if (!res.ok || !data.token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }
  authToken = data.token;
}

/**
 * Makes an authenticated request to the Payload REST API.
 * @param method - HTTP method
 * @param endpoint - API path (e.g. "/api/leads")
 * @param body - optional request body
 */
async function api(
  method: string,
  endpoint: string,
  body?: object
): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `JWT ${authToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `API ${method} ${endpoint} ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * Checks if a lead with the given name already exists.
 * @param name - business name to search for
 */
async function findLeadByName(name: string): Promise<any | null> {
  const res = await api(
    "GET",
    `/api/leads?where[name][equals]=${encodeURIComponent(name)}&limit=1`
  );
  return res.docs?.[0] ?? null;
}

async function run(): Promise<void> {
  const seedData = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8")) as any[];
  console.log(`Loaded ${seedData.length} leads from seed file.\n`);

  await login();
  console.log("Logged in.\n");

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of seedData) {
    try {
      const existing = await findLeadByName(lead.name);
      if (existing) {
        console.log(`  SKIP: ${lead.name} (already exists, id=${existing.id})`);
        skipped++;
        continue;
      }

      const payload: Record<string, any> = {
        name: lead.name,
        type: lead.type,
        address: lead.address || undefined,
        neighborhood: lead.neighborhood || undefined,
        city: "Brooklyn",
        state: "NY",
        country: "US",
        latitude: lead.latitude || undefined,
        longitude: lead.longitude || undefined,
        placeId: lead.placeId || undefined,
        instagram: lead.instagram || undefined,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        website: lead.website || undefined,
        preferredContactMethod: lead.preferredContactMethod || undefined,
        dogFriendly: lead.dogFriendly ?? false,
        hasEventSpace: lead.hasEventSpace ?? false,
        popUpHistory: lead.popUpHistory ?? false,
        independentlyOwned: lead.independentlyOwned ?? false,
        rating: lead.rating || undefined,
        fitScore: lead.fitScore || undefined,
        fitNotes: lead.fitNotes || undefined,
        status: lead.status || "researched",
      };

      // Remove undefined values so Payload doesn't choke on them
      for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
      }

      await api("POST", "/api/leads", payload);
      console.log(`  CREATE: ${lead.name}`);
      created++;
    } catch (e: any) {
      console.error(`  ERROR: ${lead.name}: ${e.message}`);
      errors++;
    }
  }

  console.log("\n=== SEED COMPLETE ===");
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped} (already existed)`);
  console.log(`Errors:  ${errors}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
