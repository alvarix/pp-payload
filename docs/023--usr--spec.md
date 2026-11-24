# Doc 23 — USR Spec — Stripe Capture Completeness

**Status:** Implementation complete — pending Alvar's verification
**Date:** 2026-11-22
**Response doc:** `docs/023--llm--spec.md` (technical spec: incident, root causes, design decisions)

---

## For dummies

The incident: a $163.31 Tap-to-Pay sale on the Stripe phone app never
appeared in the CRM. Reason: the app took the money but no email, and the
old webhook code refused to record a sale without an email. The free-form
custom amount was NOT the cause.

Fix summary (plain statements):

- Any Stripe payment now gets a CRM record, with or without an email.
- A sale with no email links to one shared placeholder client.
- Online payments get their own webhook, independent of the intake form.
- If a customer fills the intake form later, it updates the existing record.
- A script reads your Stripe account's transaction history live and can
  create the CRM records that are missing.

Everything the agent could do is done. What remains are six manual steps only
Alvar can do (Stripe dashboard, Vercel, database migration) — each is
explained in full below.

---

## Completed by the agent (no action needed)

- [x] Diagnosed why `pi_3UeJm9KsvaxLGOVJ2nHV3Ojl` was never recorded (missing email, not the custom amount)
- [x] Shared capture library (`src/lib/stripe-capture.ts`) — one code path for POS + checkout + intake
- [x] POS webhook: email-less `card_present` charges link to the shared walk-up client instead of being skipped
- [x] New checkout webhook `POST /api/stripe/checkout` for `checkout.session.completed` (paid only)
- [x] Intake form submission reconciles onto an existing stub Job instead of creating a duplicate
- [x] Migration file: unique index on `jobs.stripe_payment_intent_id` (race backstop)
- [x] Reconcile/backfill script `scripts/reconcile-stripe.mjs` (dry-run by default)
- [x] Unit tests updated + added (15 passing); `tsc --noEmit` clean
- [x] `.env.example` gains `STRIPE_CHECKOUT_WEBHOOK_SECRET` placeholder
- [x] Spec docs (23 llm + usr), README API-routes section, CHANGELOG

---

## Manual steps — what each one is and does

Order matters: 1 and 2 deploy the new safety net. 3 protects the database.
4 confirms it works. 5 and 6 repair the past.

### Step 1 — Register the new webhook endpoint with Stripe

**What it is.** A webhook is a URL you register with Stripe. Every time a
payment happens, Stripe POSTs a description of it (a JSON "event") to that
URL. The CRM's job is to read those events and create records.

**Why it's needed.** The new online-payment code lives at
`https://portal.petportraits.ink/api/stripe/checkout`, but Stripe does not
know that URL exists. Until you register it, Stripe will never send it
anything, and online payments that skip the intake form still won't be
captured. This is the single most important step.

**Exactly what to do.**

1. Stripe Dashboard (live mode) → Developers → Webhooks → **Add endpoint**.
2. Endpoint URL: `https://portal.petportraits.ink/api/stripe/checkout`
3. Select event: `checkout.session.completed` (just this one).
4. Add endpoint.
5. Open the new endpoint → **Signing secret** → **Reveal** → copy the
   `whsec_...` string. Keep it — Step 2 uses it.

**What the secret is.** It is the password Stripe uses to sign every
delivery. The app verifies each event against it, so a stranger cannot POST
fake events to the endpoint and create fake records.

**Also confirm:** the existing endpoint
`https://portal.petportraits.ink/api/stripe/pos` already subscribes to
`payment_intent.succeeded`, `customer.updated`, `invoice.updated` (it did
before; nothing changed there).

### Step 2 — Put the signing secret into Vercel

**What it is.** The deployed app reads its configuration from environment
variables in Vercel. The new endpoint checks one named
`STRIPE_CHECKOUT_WEBHOOK_SECRET` at request time.

**Why it's needed.** If the variable is missing, the endpoint logs "not
configured" and returns 500 to every delivery. Stripe retries uselessly.
(This exact mistake — wrong secret value — is what broke the POS webhook in
June; see `docs/17--spec-stripe-pos-debug-2026-06-08.md`.)

**Exactly what to do.**

1. Vercel → the pp project → Settings → Environment Variables.
2. Add `STRIPE_CHECKOUT_WEBHOOK_SECRET` = the `whsec_...` from Step 1.
   Check Production and Preview.
3. Redeploy (the running app must restart to pick it up).

### Step 3 — Database backup, duplicate check, migration

**What it is.** One migration file adds a rule to the database: no two Jobs
may carry the same Stripe payment-intent ID (`jobs.stripe_payment_intent_id`
becomes a unique index).

**Why it's needed.** It is the backstop for a race: if the webhook and the
intake form both try to create a record for the same payment at the same
moment, both may pass the code-level check and both insert. The database
rule makes the second insert fail, so a duplicate is impossible even under
load.

**Why the precautions.** Postgres refuses to build a unique index if
duplicates already exist, and a half-applied migration is messy to recover
from. So: snapshot first (backup), check for duplicates second (one query),
apply third.

**Exactly what to do.**

```bash
# 1. Backup (pg_dump snapshot to db-backups/backup_<timestamp>.sql)
./db-backups/db-backup.sh

# 2. Duplicate check — run in Supabase Dashboard → SQL Editor.
#    MUST return 0 rows. If it returns rows, STOP and tell the agent.
SELECT stripe_payment_intent_id, COUNT(*)
FROM jobs
WHERE stripe_payment_intent_id IS NOT NULL
GROUP BY 1
HAVING COUNT(*) > 1;

# 3. Apply the migration (local .env already uses the direct, non-pooler URL)
pnpm payload migrate
```

**What you should see.** The check returns an empty result (no duplicates).
The migration runs and reports the new migration name
`20261122_000000_unique_stripe_payment_intent` as applied. Risk is low: it
only creates an index; the `down` drops it. The general procedure is in
`docs/021--llm--db-migration-runbook.md`.

### Step 4 — Confirm the deployed webhook accepts events

**What it is.** A smoke test after deploy: we send one sample event to the
live endpoint and check Stripe's delivery log for the response code.

**Why it's needed.** Steps 1–3 could each be silently wrong (typo'd secret,
wrong URL, missing env var in one scope). This step catches all of them at
once before a real sale depends on it.

**Exactly what to do.**

1. Deploy (Vercel, after Step 2).
2. From a terminal logged into the Stripe CLI:
   `stripe trigger checkout.session.completed`
3. Stripe Dashboard → Developers → Webhooks → the `/api/stripe/checkout`
   endpoint → recent deliveries.

**What you should see.** The delivery shows response **200**, not 400
("Invalid signature") and not 500. A 400 means the secret in Vercel does not
match the endpoint's — redo Step 2 carefully.

**What you should NOT expect.** The sample event is not a real paid sale
(no money moved), so it will probably NOT create a Job. That's fine — this
test only proves the signature is accepted. Real capture is proven by the
next genuine payment, or by Step 6 finding zero missing.

### Step 5 — Backfill the missing $163.31 (the incident charge)

**What it is.** "Backfill" = create the CRM record for a sale that already
happened in Stripe but was never recorded. There is no manual data entry and
no "searching through output" — a script does everything.

**How the script gets the data (this is the part that was unclear).** The
script does not read logs or output. It talks to two live systems:

1. **Stripe's API.** It calls `GET /v1/charges?paid=true&limit=100` with your
   secret key and pages through the account's complete charge history —
   every dollar you ever captured, straight from Stripe's own database.
   Each charge carries its amount, date, currency, the email (if any), and
   the payment-intent ID (`pi_...`).
2. **The CRM's API.** For each charge it asks: does a Job exist that
   references this `pi_...`? (One lookup per payment intent.)

Anything in Stripe with no matching Job is a sale the CRM lost. The report
prints those. With `--backfill`, the script then creates each missing record
through the same API the webhooks use — client (or the shared walk-up
placeholder), Job, payment entry. It writes the same field shapes the
webhooks write, plus a note saying it was backfilled, so the record is
distinguishable from a live capture.

**Prerequisites.** The dev server must be running (the script talks to the
CRM at `localhost:3000`), and `.env` must contain `STRIPE_SECRET_KEY` plus
`PAYLOAD_EMAIL` / `PAYLOAD_PASSWORD` (admin login). It writes to the live
database — that is intended: these are real sales that really happened.

**Exactly what to do.**

```bash
# Terminal 1 — the CRM server
pnpm dev

# Terminal 2 — report only. Creates NOTHING.
node --env-file=.env scripts/reconcile-stripe.mjs --pi=pi_3UeJm9KsvaxLGOVJ2nHV3Ojl
# Expected: "Missing from CRM: 1" and a line:
#   MISSING  pi_3UeJ...  163.31 USD · 2026-11-2x · POS
#   email: (none — would link to walk-up placeholder)

# If the report matches the charge you know — then create it:
node --env-file=.env scripts/reconcile-stripe.mjs --backfill --pi=pi_3UeJm9KsvaxLGOVJ2nHV3Ojl
# Expected: "backfilled -> job <id> (client <id>)"

# Verify: run the report again — expect "Missing from CRM: 0".
# Or open /admin/collections/jobs — the new record has the note
# "[POS sale — backfilled by reconcile script]".
```

**What the created record will contain.** Client
`pos-walkup@petportraits.ink` (the charge had no email — that placeholder is
never marketing-emailable), source `pos`, status `intake_received`, the
Stripe IDs, $163.31, one `payment_methods` row, empty pets.

**Afterwards (optional but good).** When you learn who the buyer was, open
the Job in Payload admin and change its `client` field to the real client.
The record is otherwise identical to a live capture.

### Step 6 — Scan and backfill ALL history (recommended)

**What it is.** Step 5 but without the `--pi=` filter: the script reads every
succeeded charge in the account's history and reports every one missing
from the CRM — not just the $163.31. This was your "can we search Stripe
records to backfill other instances" question: yes, this step is that.

**Why it's needed.** The webhook bugs existed since June. Other sales may
have been silently missed the same way. This is the only way to find out.

**Exactly what to do.**

```bash
# Report only — creates NOTHING:
node --env-file=.env scripts/reconcile-stripe.mjs

# Review the printed list. Anything you don't recognize as a real missing
# sale — ask before backfilling. Then create them all:
node --env-file=.env scripts/reconcile-stripe.mjs --backfill

# Verify: rerun the report — expect 0 missing.
```

**Optional flags.** `STRIPE_SINCE=<unix timestamp>` (env var) limits the
scan to charges after that date, e.g. only sales from June onward:
`STRIPE_SINCE=$(date -j -f "%Y-%m-%d" "2026-06-01" +%s)`.

---

## Verification commands (the agent already ran these)

```bash
npx tsc --noEmit                              # clean
npx vitest run --config ./vitest.config.mts  # 15/15 passing
```

## Open questions — what each one means

### Open question 1 — POS notification email for walk-up sales

**What it means.** When a POS sale with NO email is captured (now or via
backfill), the POS webhook sends you an admin notification email titled
`[POS] New sale: pos-walkup@petportraits.ink — $163.31`. Important: that
email goes to **you** (the admin address). Nothing is ever sent TO the
placeholder address — it is marked non-mailable.

**The question.** Keep that behavior — you get an immediate email per
walk-up sale so you can identify the buyer — or suppress the email for
email-less sales (the record is still created; you just don't get notified).

**My recommendation.** Keep it. An email per walk-up sale is a prompt to
find out who paid you cash-in-person; suppressing makes capture silent.

### Open question 2 — Scheduled vs on-demand reconcile runs

**What it means.** Today the Step 6 scan runs only when you type the
command. "Scheduled" would mean an automated runner (e.g. a monthly Vercel
Cron job) that performs the same scan and emails you the report, so drift
between Stripe and the CRM is caught even if nobody runs the script.

**The question.** Stay on-demand, or build the scheduled version?

**My recommendation.** On-demand for now. The webhooks themselves are the
primary capture; the scan is a periodic safety net. If after a few weeks
you want the net automated, that's a small follow-up under this same doc
number.

---

## Where everything is documented

| Topic | Location |
| --- | --- |
| Incident analysis, root causes, design decisions | `docs/023--llm--spec.md` |
| These manual steps, explained (this file) | `docs/023--usr--spec.md` |
| Technical backfill procedure + checklist | `docs/023--llm--spec.md` §"Backfill procedure" and §"Stripe dashboard + Vercel checklist" |
| Webhook endpoints + reconcile script, one-line each | `README.md` §"API routes" |
| Summary of the whole pass | `CHANGELOG.md` §"Unreleased" → "Stripe capture completeness" |
| Env var placeholders | `.env.example` (Stripe block) |
| June's similar webhook incident (context) | `docs/17--spec-stripe-pos-debug-2026-06-08.md` |
| General database migration runbook | `docs/021--llm--db-migration-runbook.md` |