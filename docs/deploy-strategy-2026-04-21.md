# Deploy Strategy — 2026-04-21

Short-term plan to get `pp-v2` live and ready to replace the WordPress intake form. Branch: `deploy`.

This doc layers on top of `docs/project-review-2026-04-20.md` — specifically unblocking **Near-term trajectory item 1** (WP intake replacement). Items A1–A3 in that review still apply before the WP cutover; this doc is about *where* the app runs and *how* it interoperates with Stripe, storage, and multi-pet intake.

---

## Goal

1. Stand up a production URL for `/intake` and `/api/intake`.
2. Accept Stripe Payment Link redirects and prefill the intake form from the Stripe checkout session.
3. Store uploaded pet photos somewhere cheap, durable, and independent of the app server.
4. Allow multiple pets per submission (WP form parity).

Non-goal for this pass: RBAC, full Stripe webhook reconciliation (review item B), dashboard UX rework (review item C).

---

## Decision 1 — Where to deploy — **LOCKED: Vercel + Supabase**

Database stays on Supabase (already migrated there — no reason to move). App goes on **Vercel** (free Hobby tier, best-in-class Next.js hosting, per-branch preview URLs, free TLS). Media goes on **Supabase Storage** (same dashboard as DB — one vendor for the data plane). See Decision 3.

### Why Vercel over a DigitalOcean droplet

Considered co-locating the app with media on DO for simplicity. Rejected because:
- Payload 3.0 **is** a Next.js app; Vercel is the native home for Next.js and requires zero ops for a solo developer.
- Co-locating app + media on one DO droplet still means Postgres is on Supabase, so we're already a two-vendor stack either way. Putting the app on Vercel just replaces "droplet ops" with "Supabase Storage config" — strictly less work.
- Vercel preview deploys per git branch are valuable for this project (intake form changes need to be testable before hitting production WP traffic).

### Risks / things to watch

- **Intake is mission critical.** A failed submission is a lost paying customer. Design for robustness from day 1:
  - Browser-direct uploads to Supabase Storage via **signed URLs** (not multipart POST through the serverless function) — photos never touch our function, so the 10s timeout stops being a factor for payload size. See "Upload flow" in Decision 3.
  - Client-side retry with exponential backoff on transient network errors (3 retries, 1s / 2s / 4s).
  - Explicit success / failure UI — never silent. On failure, show "Your form didn't submit. We've saved your progress locally — try again or email us at …" and persist form state to `localStorage` so the user doesn't lose it on refresh.
  - Server-side: if the Job create succeeds but a subsequent Media link fails, we want the Job to still exist with whatever photos succeeded, and we log the failure. Better partial-record than lost lead.
- **Payload admin cold start** is heavier in serverless than a long-running Node process. Acceptable for a rarely-hit admin UI.
- **Supabase free tier pauses after 7 days of inactivity.** Not a problem in production; be aware for preview/staging projects.

---

## Decision 2 — Stripe Payment Link prefill — **LOCKED**

- `/intake` remains **publicly accessible** (no Stripe-gate). Leads without a Stripe session can still submit.
- Payment Link is **variable amount** — so the amount is read from the Stripe Checkout Session on every redirect, never hardcoded.
- When the form is reached via Stripe redirect, prefill what we can from the session. When reached directly, show a blank form.

### What Stripe gives you

Stripe Payment Links redirect to a "success URL" after payment. The only dynamic placeholder Stripe interpolates into that URL is `{CHECKOUT_SESSION_ID}`. That's it — you can't template `{email}` or `{address}` into the URL directly.

But: with the session ID you can retrieve the full Checkout Session server-side via the Stripe API. That gives you:
- `customer_details.email`
- `customer_details.name`
- `customer_details.phone` (if "collect phone" enabled on the link)
- `customer_details.address` (if "collect shipping address" enabled — and only for physical goods)
- `payment_intent` id
- `amount_total`, `currency`, `payment_status`
- Any `metadata` you set on the link or session

### Recommended flow

1. In the Stripe dashboard, on the Payment Link, set the **success URL** to:
   ```
   https://<your-domain>/intake?session={CHECKOUT_SESSION_ID}
   ```
2. Enable "collect shipping address" and "collect phone number" on the link so Stripe captures them.
3. In the new `app/(frontend)/intake/page.tsx`, detect `?session=...` server-side (server component), fetch the session from Stripe using the secret key, and pass the prefill values to `<IntakeForm />` as props (`defaultFirstName`, `defaultEmail`, etc.).
4. `<IntakeForm />` uses those props as `defaultValue` on the inputs. User can edit before submit.
5. Hidden fields on the form carry the Stripe identifiers through to `/api/intake`:
   - `stripe_session_id`
   - `stripe_payment_intent_id`
   - `stripe_customer_id` (if Stripe created/matched a Customer)
   - `amount_paid_cents` (integer, currency-aware formatting later)
6. The API route stores those on the created Job so later webhook reconciliation (review item B) has something to match against.

### What you should NOT put in hidden fields

- **Never** card numbers, CVV, exp date. Stripe never exposes these to you — they stay on Stripe's servers. This is a PCI requirement. If anyone asks, the answer is always no.
- Probably not the raw `amount_total`, since the client could forge it — but if you also record it from the webhook, it's fine as a UI hint.

---

## Decision 3 — File storage — **LOCKED: Supabase Storage**

Chosen on these axes (in order of priority): reliability, price, ease of use, non-complexity / maintainability.

Supabase Storage wins because:
- **Reliability** — same backing infra as the DB already in production use.
- **Price** — 1 GB free; paid tier starts at $0.021/GB/mo. Cheap enough that we won't bother optimizing for months.
- **Ease of use** — one dashboard for DB + files. Single set of credentials to manage.
- **Non-complexity** — Payload's supported `@payloadcms/storage-s3` plugin talks to Supabase's S3-compatible endpoint. No custom adapter code.

### Migration path if costs ever matter

If we ever serve hundreds of GB of images, Cloudflare R2 (zero egress fees, $0.015/GB/mo) becomes attractive. Both are S3-compatible, so the swap is a single env-var / plugin config change and a one-time object copy — not a rewrite. Documenting this so we don't over-engineer now for a problem we don't have.

### Why not WP media library

WP media lives on the WordPress host, has no deduplication, no lifecycle rules, makes backups heavier, and couples the app's media to WP's uptime and plugins. Using a dedicated object store decouples them and makes the WP site → `/intake` cutover reversible.

### Upload flow — signed URLs from day 1 (mission critical)

1. Browser requests a batch of signed upload URLs from `/api/intake/upload-url`. Request body specifies filename + MIME type + size per file. Server validates (size, MIME allowlist, max count), returns signed PUTs.
2. Browser PUTs each photo directly to Supabase Storage. Retries on transient failure (1s / 2s / 4s backoff).
3. Browser POSTs the rest of the form (text + object keys) to `/api/intake`. Serverless function creates Client, Media records (referencing the keys), and Job — all inside a single Payload transaction so a failure partway can't orphan half-a-record.

Failure modes and handling:
- **Network fails mid-upload** → client-side retry. If all retries exhaust → show inline error, preserve form state in `localStorage`.
- **Signed URL expires** → client requests fresh URL and retries.
- **DB transaction fails after successful uploads** → orphaned objects in storage. See §"Pruning" below.
- **User closes tab mid-submit** → `localStorage` preserves form state; next visit to `/intake` can offer "resume?"

### Growth, pruning, and media management

The business is expected to grow. Several GB of pet photos is realistic within a year. Bake operational hygiene in now rather than retrofit later.

**Consistent object naming.** Each Media object gets a key of the form `jobs/<jobId>/<mediaId>-<originalFilename>`. This makes it cheap to:
- List all files belonging to a Job.
- Delete all files when a Job is deleted.
- Spot orphans (files whose prefix doesn't match any Job).

**Payload's built-in media library.** Payload's Admin UI has a list view for the Media collection. Rows, thumbnails, filters, bulk delete. No custom app needed for normal use. Extend if/when we need Job-scoped views.

**Orphan pruning.** Two kinds of orphan:
1. Storage object with no Media record (upload succeeded but Payload write failed). Fix with a nightly script that lists bucket keys and reconciles against `media` table.
2. Media record with no referencing Job/Pet (Job was deleted, Media wasn't cascaded). Fix by adding a cascading-delete hook on the Job `beforeDelete` that removes its Media records (and therefore their objects).

Implementation later as a small `scripts/prune-orphans.ts` run manually at first, then via a Supabase scheduled function or a `pg_cron` job.

**Retention policy.** For now: never auto-delete. Once the portrait is delivered, the photos are still useful for portfolio and reprints. Revisit in 12+ months.

### Future task — resize before storage

Pet photos off modern iPhones are 3–5 MB each. A 5-photo submission is 15–25 MB; we only need ~500 KB per image for admin previews and portfolio. But the artist may want originals for high-res printing.

Plan (not in this pass):
- Resize server-side (via `sharp`, already a dependency) to a max 2000 px long-edge, JPEG q85 — store as the "display" version.
- Keep original bytes too, under a separate key (`jobs/<jobId>/<mediaId>-original.<ext>`), until we confirm the artist never needs them. Cheaper to delete later than to re-request a customer for lost originals.
- Use Payload's `imageSizes` on the Media collection to auto-generate thumbnails alongside.
- **Test:** a 4 MB HEIC input produces a <500 KB display JPEG + the original in storage; admin preview looks good; image size appears in Payload's media library.

Do this after initial deploy is stable — don't couple "get live" to "optimize images."

---

## Decision 4 — Multiple pets — **LOCKED: stacked accordion**

### Current state

`src/app/(frontend)/intake/IntakeForm.tsx` has one pet section (fields `pet_name`, `pet_sex`, etc.). `src/app/api/intake/route.ts:77-86` hardcodes `pets: [{…}]` — a single element array. WP form allowed N pets; current form does not.

### Proposed approach

Mirror the existing "add more photos" pattern (`IntakeForm.tsx:10,211-243`). That pattern uses a `useState` array of input-group IDs and renders one group per ID.

1. Replace `pet_name`, `pet_sex`, etc. with indexed `name` attributes — e.g., `pets[0][name]`, `pets[0][sex]`, and `pets[0][pics][]` for that pet's photos.
2. Add "Add another pet" button that pushes a new ID into a `pets` state array. Each pet section has its own photo uploader (so photos map to the right pet).
3. Render a "Remove" button on all but the first pet.
4. Update `/api/intake` to parse `formData.getAll` with the indexed keys. Loop over pets, upload that pet's photos, build the `pets: [...]` array accordingly.

### UX

Stacked accordion. Each pet gets a section with a header ("Pet 1 — [name]"), clickable to collapse/expand. First pet expanded by default. "+ Add another pet" button at the bottom appends a new collapsed section pre-expanded for entry. Remove button on all but the first pet.

Native HTML `<details>` + `<summary>` gets us accordion behavior with zero JS and correct a11y defaults. No new deps. Add Tailwind styling to make it look consistent with the rest of the form.

### Test

Submit a form with 2 pets, 2 photos each. The resulting Job should have a `pets` array of length 2, each with its own `pics` array of length 2. Add this as a Playwright e2e spec in `tests/e2e/intake.e2e.spec.ts` alongside the existing dashboard specs.

---

## Non-controversial steps that can proceed now

Per CLAUDE.md, I (Claude) don't edit code. Below are steps you can execute while awaiting decisions above. Each is small and reversible, and each has a test you can run. Mark them done in `._-/done-deploy.md` as you go.

### Step 0 — Prep (do regardless of deploy target)

**0a.** Create `.env.example` with the full list of env vars the app expects. This is the contract for whichever deploy target we pick.

  - Run: `grep -rh 'process\.env\.' src/ | grep -oE 'process\.env\.[A-Z_]+' | sort -u`
  - Every var that comes back, add to `.env.example` with an empty value and a one-line comment.
  - Test: `node -e "require('dotenv').config({path:'.env.example'}); console.log('ok')"` runs without error.
  - Commit: `chore: add .env.example`

**0b.** Confirm `next.config.mjs` has `output: 'standalone'`. The `Dockerfile:1` comment says it's required, but I haven't verified the config has it.

  - Open `next.config.mjs`, check for `output: 'standalone'`.
  - If missing and we go with deploy option B (droplet/Docker), add it. If we go A (Vercel), not needed.
  - Test: `pnpm build` succeeds, and — if standalone is set — `.next/standalone/server.js` exists.

**0c.** Verify `.gitignore` covers `.env`, `media/`, `.next/`, `node_modules/`, `pp-wp`, `pp-wp.pub`. (Review doc says these are already gitignored; verify before the first deploy.)

  - Run: `git check-ignore -v .env media/ pp-wp pp-wp.pub`
  - Each should print an ignore rule. If any don't, add them.
  - Test: `git status --ignored` shows these under "Ignored files".

### Step 1 — Supabase project (if going with option A)

**1a.** In Supabase dashboard, create a new project. Region: pick the one closest to your Vercel region (typically `us-east-1`).
  - Save the DB connection string (Settings → Database → Connection string → URI, "Use connection pooling" version for Vercel).
  - Save the service role key and anon key (Settings → API).
  - Do NOT commit these. Stash them in your password manager; add them to Vercel env vars later.

**1b.** Test local connection to the remote DB *without* migrating yet:
  - Temporarily set `DATABASE_URI` in a scratch `.env.local` to the Supabase URI.
  - Run `pnpm dev` — Payload should boot and offer to run migrations. **Don't run them yet** (Ctrl-C first). We want to review the migration diff before applying it to the remote DB.
  - Test: the dev server prints "pending migrations" without erroring on connection.

**1c.** Create a Supabase Storage bucket named `media` (private). Save the S3 endpoint URL and access key pair (Storage → Settings → S3 Connection).

### Step 2 — Stripe Payment Link audit

Not a code change — a Stripe dashboard check:

**2a.** Log into Stripe. For each active Payment Link, confirm:
  - Success URL contains `{CHECKOUT_SESSION_ID}`.
  - "Collect customer's phone number" is on.
  - "Collect shipping address" is on (if the product is shipped).
  - Any metadata you want carried (e.g., `product_type: portrait`) is set on the link.

**2b.** Grab a test-mode Payment Link and click through a test payment. On the success page, copy the final URL. Confirm it looks like `https://<your-url>/intake?session=cs_test_...`.

**2c.** Document which Payment Links redirect where, so the intake page knows which products it's being used for. A short table in this doc is fine — I'll add a section below once you share.

### Step 3 — CI sanity before deploy (review doc F, but cheap to bring forward)

**3a.** Run locally and confirm all three pass:
  - `pnpm lint`
  - `npx tsc --noEmit`
  - `pnpm test:int`

**3b.** If anything fails, fix before deploy. A broken build is a broken deploy.

### Step 4 — Pick a staging domain

**4a.** Decide: custom domain now, or `*.vercel.app` for launch?
  - If custom: add the domain to Vercel during project setup. Update Stripe Payment Link success URLs to the custom domain (so you don't have to rotate them later).
  - If `*.vercel.app` for now: keep Stripe Payment Link success URLs pointing to the Vercel preview/prod URL, plan to rotate them when the custom domain comes online.

### Step 5 — Docker teardown — **DONE 2026-04-21**

Removed: `docker-compose.yml`, `docker-compose.mongo-example.yml`, `Dockerfile`. If we ever need containerization again, the Next.js + Payload Dockerfile is standard and regenerable from the official Next.js docs.

`.gitignore` Docker section collapsed to a generic `*.log` rule (dropped `pgdata/`, `docker-data/`).

`README.md` setup block swapped from `docker-compose up -d` to Supabase connection-string guidance. See Step 0 for `.env.example` expansion.

---

## Execution order (once decisions are made)

| # | Task | Depends on | Test |
|---|---|---|---|
| 1 | Create `.env.example`, verify `.gitignore` | — | Doc |
| 2 | Provision Supabase project + bucket | Decision 1A confirmed | Connect from local dev |
| 3 | Add `@payloadcms/storage-s3` plugin + config pointing at Supabase Storage | 2 | Admin uploads a file → appears in Supabase bucket |
| 4 | Run Payload migrations against Supabase DB | 2 | `payload migrate` clean; `clients` table exists |
| 5 | Implement multiple-pets in `IntakeForm.tsx` + `/api/intake` | Pets UX decision | 2-pet submission creates 1 Job w/ 2 pets |
| 6 | Implement Stripe session prefill in `intake/page.tsx` | Stripe questions answered | Visit `/intake?session=cs_test_...` → fields prefilled |
| 7 | Apply A1–A3 from project-review doc (Zod, intake key, rate limit, overrideAccess sweep) | — | Review doc tests |
| 8 | Deploy to Vercel, set env vars, verify preview deploy works | 1–7 | `curl` against preview URL for `/api/intake` w/ valid payload → 200 |
| 9 | Point custom domain + update Stripe success URLs | 8 | End-to-end: real test Payment Link → intake → Job |
| 10 | Switch WP form POST target to production `/api/intake` | 9 | Submit via WP form → Job appears in admin |

---

## Iteration

_(User updates this section as questions get answered or direction changes. Refer back before each step.)_

- 2026-04-21 — **Decisions locked:** Vercel (app) + Supabase (DB + Storage). Open intake (no Stripe gate). Stripe Payment Link is variable-amount — read from session. Stacked accordion for multi-pet. Docker no longer integrated — teardown in Step 5.
- 2026-04-21 — Future task: resize uploads before storage (documented in Decision 3).
- 2026-04-21 — Intake is mission critical. Upload flow uses signed URLs from day 1 (not "ship simple, iterate"). Pruning and orphan handling are architectural concerns up front, not retrofits.
- 2026-04-21 — Priority reorder: (C) Stripe prefill first, then (A) Supabase Storage, then (B) multi-pet (lowest priority).

---

## Changelog

- 2026-04-21 — initial draft.
- 2026-04-21 — decisions locked after first review: Vercel + Supabase + Supabase Storage + open intake + variable Stripe + stacked accordion + Docker teardown.
