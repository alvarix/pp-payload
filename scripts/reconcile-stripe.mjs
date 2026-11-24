/**
 * reconcile-stripe.mjs
 *
 * Scans Stripe for succeeded charges and verifies every one has a matching
 * Job in the CRM. Reports missing ones (dry-run default) and, with
 * --backfill, creates the missing Client + Job records through the Payload
 * REST API using the same field shapes as the webhooks.
 *
 * Answers: "did any Stripe transaction fail to enter the CRM?"
 *
 * Usage (run from the repo root, dev server must be running):
 *
 *   node --env-file=.env scripts/reconcile-stripe.mjs            # dry-run report
 *   node --env-file=.env scripts/reconcile-stripe.mjs --backfill # create missing
 *   node --env-file=.env scripts/reconcile-stripe.mjs --pi=pi_abc          # single PI
 *   node --env-file=.env scripts/reconcile-stripe.mjs --backfill --pi=pi_abc
 *
 * Optional env vars:
 *   PAYLOAD_URL     - defaults to http://localhost:3000
 *   PAYLOAD_EMAIL / PAYLOAD_PASSWORD - admin login for the REST API
 *   STRIPE_SECRET_KEY - live key from .env
 *   STRIPE_SINCE    - only consider charges created on/after this unix
 *                     timestamp (default: all history)
 *
 * Exit codes: 0 = scan complete (missing or not), 1 = usage/config error,
 * 2 = API error. Distinguish in CI/automation if needed.
 */

const BASE_URL = process.env.PAYLOAD_URL || "http://localhost:3000";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const EMAIL = process.env.PAYLOAD_EMAIL;
const PASSWORD = process.env.PAYLOAD_PASSWORD;
const SINCE = process.env.STRIPE_SINCE ? Number(process.env.STRIPE_SINCE) : undefined;
const args = process.argv.slice(2);
const DO_BACKFILL = args.includes("--backfill");
const PI_ARG = args.find((a) => a.startsWith("--pi="))?.slice("--pi=".length);

const WALKUP_EMAIL = "pos-walkup@petportraits.ink";

if (!STRIPE_KEY) {
  console.error("Error: STRIPE_SECRET_KEY is not set. Run with --env-file=.env");
  process.exit(1);
}
if (DO_BACKFILL && (!EMAIL || !PASSWORD)) {
  console.error("Error: --backfill needs PAYLOAD_EMAIL and PAYLOAD_PASSWORD.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe GET ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data).slice(0, 200)}`);
  return data.token;
}

async function findJobByPI(token, paymentIntentId) {
  const url =
    `${BASE_URL}/api/jobs?where[stripe_payment_intent_id][equals]=` +
    `${encodeURIComponent(paymentIntentId)}&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  if (!res.ok) throw new Error(`Payload jobs query -> ${res.status}`);
  const data = await res.json();
  return data.docs?.[0] ?? null;
}

async function findOrCreateClient(token, email) {
  const url = `${BASE_URL}/api/clients?where[email][equals]=${encodeURIComponent(email)}&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  const data = await res.json();
  if (data.docs?.[0]) return data.docs[0];

  const createRes = await fetch(`${BASE_URL}/api/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    body: JSON.stringify({
      email,
      // Placeholder walk-up client is never mailable.
      ...(email === WALKUP_EMAIL
        ? {
            marketing_consent: false,
            marketing_status: "never_asked",
            consent_basis: "none",
            notes: "POS walk-up placeholder — no email captured at terminal.",
          }
        : {}),
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Client create -> ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`);
  }
  return createRes.json();
}

/** Build the same Job stub shape the webhooks create (capturePaymentStub). */
function jobStubData(clientId, ch) {
  const isPos = ch.payment_method_details?.type === "card_present";
  return {
    client: clientId,
    source: isPos ? "pos" : "website",
    status: "intake_received",
    notes: `[${isPos ? "POS sale" : "Website payment"} — backfilled by reconcile script]`,
    stripe_payment_intent_id: ch.payment_intent,
    stripe_customer_id: typeof ch.customer === "string" ? ch.customer : undefined,
    stripe_amount_paid_cents: ch.amount,
    stripe_currency: ch.currency,
    stripe_payment_status: "paid",
    payment_methods: [
      {
        method: isPos ? "pos" : "website",
        amount: ch.amount / 100,
        date: new Date(ch.created * 1000).toISOString(),
      },
    ],
    pets: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────

async function listSucceededCharges() {
  // Charges (not payment intents) so we get payment_method_details + emails
  // in one listing, and paid=true filters to money actually captured.
  const all = [];
  let url = "/v1/charges?limit=100&paid=true&expand[]=data.payment_intent";
  if (SINCE) url += `&created[gte]=${SINCE}`;
  while (url) {
    const page = await stripeGet(url);
    all.push(...page.data);
    url = page.has_more
      ? `/v1/charges?limit=100&paid=true&expand[]=data.payment_intent&starting_after=${page.data[page.data.length - 1].id}` +
        (SINCE ? `&created[gte]=${SINCE}` : "")
      : null;
  }
  return all;
}

async function getSingleCharge(piId) {
  const pis = await stripeGet(`/v1/payment_intents/${piId}?expand[]=latest_charge`);
  const latest = pis.latest_charge;
  if (!latest) return null;
  return latest;
}

function classify(ch) {
  const isPos = ch.payment_method_details?.type === "card_present";
  return {
    isPos,
    email: ch.receipt_email ?? ch.billing_details?.email ?? null,
    label: `${(ch.amount / 100).toFixed(2)} ${ch.currency.toUpperCase()} · ${new Date(ch.created * 1000).toISOString().slice(0, 10)} · ${isPos ? "POS" : "online"}`,
  };
}

async function run() {
  console.log(`\npp-crm — Stripe reconcile`);
  console.log(`CRM: ${BASE_URL}${DO_BACKFILL ? "" : "  (dry run — no changes)"}\n`);

  let token = null;
  if (DO_BACKFILL) {
    token = await login();
    console.log("Authenticated to Payload.\n");
  }

  // Collect candidate charges
  let charges;
  if (PI_ARG) {
    console.log(`Single-PI mode: ${PI_ARG}`);
    const ch = await getSingleCharge(PI_ARG);
    if (!ch || !ch.paid) {
      console.log("No paid charge found for that PI. Nothing to do.");
      return;
    }
    charges = [ch];
  } else {
    charges = await listSucceededCharges();
  }

  console.log(`Succeeded charges in Stripe: ${charges.length}`);

  // Dedupe PIs (one PI can have retries/refund recharges listing same intent)
  const seenPI = new Set();
  const missing = [];
  let checked = 0;
  let ok = 0;
  for (const ch of charges) {
    const piId =
      typeof ch.payment_intent === "string"
        ? ch.payment_intent
        : ch.payment_intent?.id;
    if (!piId || seenPI.has(piId)) continue;
    seenPI.add(piId);

    // CRM check requires auth even for the report — login lazily.
    if (!token) token = await login();
    checked += 1;
    const job = await findJobByPI(token, piId);
    if (job) {
      ok += 1;
      continue;
    }
    missing.push(ch);
  }

  console.log(`Unique payment intents checked: ${checked}`);
  console.log(`Matched in CRM:                ${ok}`);
  console.log(`Missing from CRM:               ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("All Stripe transactions have a CRM record. Nothing to backfill.");
    return;
  }

  for (const ch of missing) {
    const { email, label } = classify(ch);
    const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    console.log(`MISSING  ${piId}  ${label}`);
    console.log(`         email: ${email ?? "(none — would link to walk-up placeholder)"}`);

    if (DO_BACKFILL) {
      const client = await findOrCreateClient(token, email ?? WALKUP_EMAIL);
      const res = await fetch(`${BASE_URL}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
        body: JSON.stringify(jobStubData(client.id, ch)),
      });
      if (!res.ok) {
        console.error(`         BACKFILL FAILED: ${res.status} ${(await res.text()).slice(0, 200)}`);
        process.exitCode = 2;
      } else {
        const job = await res.json();
        console.log(`         backfilled -> job ${job.id} (client ${client.id})`);
      }
    }
  }

  if (!DO_BACKFILL && missing.length > 0) {
    console.log(`\nDry run only. Re-run with --backfill to create these records.`);
  }
}

run().catch((err) => {
  console.error("Reconcile failed:", err.message);
  process.exit(2);
});