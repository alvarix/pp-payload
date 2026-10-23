# Changelog

Notable changes to `pp-v2`. Dates in YYYY-MM-DD.

## Unreleased

### Install and typecheck gates repaired

- `pnpm install --frozen-lockfile` was failing with `ERR_PNPM_IGNORED_BUILDS`
  (esbuild, sharp, unrs-resolver). pnpm 12 no longer reads
  `package.json#pnpm.onlyBuiltDependencies`, so the allowlist was dead config.
  Approvals now live in `pnpm-workspace.yaml` under `allowBuilds:`, and the
  obsolete `package.json#pnpm` block was removed. A clean install exits 0.
- `pg` 8.16.3 and `@types/pg` 8.10.2 added as devDependencies. This closes the
  long-standing `tsc --noEmit` error `Cannot find module 'pg'` in
  `tests/int/migrations/20260712_add_jobs_testimonial.int.spec.ts`, so typecheck
  is now a usable gate instead of permanently red.
- That migration spec had a second, hidden defect: `loadDbUrl()` matched
  `DATABASE_URL` with a loose regex, which hit the **commented** `#DATABASE_URL=`
  line at the top of `.env` and therefore tried to connect to
  `127.0.0.1:5432` (`ECONNREFUSED`). It now parses `.env` with `dotenv.parse`,
  which skips comments and strips quotes. The suite creates and drops its own
  `migration_test_20260712` table on whatever `DATABASE_URL` points at; no
  production table is touched and no rows are read or written outside it.
- Verified: `pnpm install --frozen-lockfile` exit 0, `tsc --noEmit` exit 0,
  `pnpm run test:int` 119/119 across 12 files, and the scratch table is gone
  afterwards.

### Node runtime pin moved off EOL Node 18

- Investigation of a Stripe "outdated Node.js" telemetry notice. Verified with
  `vercel inspect --json` that the pp-payload production deployment runs
  `nodejs24.x` and has for 39+ days, so production was never the source. The
  account's other traffic is Ruby (PocketVendor POS), browser (Stripe.js), and
  PHP (WordPress) — no Node 18 caller was ever identified. Notice left
  unresolved; reply to Stripe asking for the triggering request ID if it
  recurs.
- `.nvmrc` changed `18` → `22`. The old value came from the Payload starter
  template (written 2026-01) and would put anyone running `nvm use` in this
  directory onto Node 18.20.8, EOL since 2025-04-30.
- `engines.node` changed `^18.20.2 || >=20.9.0` → `^22.0.0 || ^24.0.0`. Node 24
  is included because the Vercel project setting is 24.x; restricting to 22
  would have contradicted the deployed runtime.
- `package-lock.json` (gitignored, stale npm-era artifact) was left untouched.

### Client-side writes no longer depend on SERVER_URL

- `csrf`/`cors` are now built from one `ALLOWED_ORIGINS` list containing
  `SERVER_URL`, any comma-separated `EXTRA_ORIGINS`, the production origin
  `https://portal.petportraits.ink`, and localhost/127.0.0.1 on ports 3000-3002.
- Root cause of the 2026-10-21 status-change 401: Payload treats an **empty**
  `csrf` list as "no restriction" (`csrf.length === 0`), and appends `serverURL`
  only when it is non-empty. Production had `SERVER_URL` unset, so the list was
  empty and the check was effectively off. Adding the localhost origins made the
  list non-empty, the check strict, and production `fetch` was rejected while SSR
  kept working. A missing env var must not be able to do that again.
- Production boot now logs a warning when `SERVER_URL` is unset, because absolute
  URLs stay broken without it even though CSRF no longer depends on it.
- README lists `SERVER_URL` in the Vercel environment table; it was previously
  documented only in `.env.example`.

### Client data removed from git history

Five tracked files containing client and organization contact data were removed
from every commit on every branch, and `main` and `deploy` were force-pushed. The
remote no longer has them reachable from any ref.

- Removed from history: `data_import/consolidated_clients2.csv`,
  `data_import/cleaned-clients.json`, `data_import/cleaned-jobs.json`,
  `docs/all-leads-seed.json`, `docs/outreach-leads-seed.json`.
- All five are still on disk, byte-identical, and now listed in `.gitignore`. The
  `data_import/*.mjs` scripts still run locally but need those files supplied by
  hand, since a fresh clone no longer contains them.
- Commit SHAs on `main` and `deploy` changed. Any existing clone must be re-cloned
  or hard-reset; a normal pull will not reconcile the rewritten history.
- One empty commit was pruned; commit count went 157 to 156.

Two things remain true and are not fixable from this repo:

- GitHub keeps unreachable objects retrievable by SHA until it garbage-collects
  them. Truly purging them requires GitHub support or recreating the repository.
- The pre-rewrite history is preserved locally in `.git/pre-purge-20261021.bundle`
  and under `refs/original/`. Both contain the data. Never run `git push --mirror`
  from this clone while they exist.

### Export page describes the file it downloads

- New `/dashboard/export/clients` page. Opening it starts the CSV download and
  shows the exact parameters: resolved endpoint and filter, row count, filename,
  encoding, line endings, quoting rules, every column with a live sample value,
  and the marketing-status breakdown.
- "Export for Brevo" in the dashboard nav now points at that page instead of
  straight at the API route.
- Auto-download with a manual button fallback, because Safari sometimes blocks a
  download triggered during page load.
- Export logic extracted to `src/lib/client-export.ts`, used by both the page and
  the route, so the description cannot drift from the file. The route also
  reports `X-Rows-Exported`.

### Schema push disabled in dev

- `push: false` set on the Postgres adapter in `src/payload.config.ts`. Dev mode
  no longer reconciles the database against the collection configs, so `next dev`
  can no longer drop tables. It did on 2026-10-21: it detected
  `clients_consent_snapshot_20261021` as an unmanaged table, showed a
  `DATA LOSS WARNING`, and deleted it once the prompt was accepted.
- Schema changes now happen only through `payload migrate`. If a collection is
  edited without a migration, the running app will read a column the database
  does not have, so writing the migration is required rather than optional.

### Brevo client export + marketing status

- New `GET /api/dashboard/export/clients` returns a Brevo-shaped CSV
  (`email, firstname, lastname, consent_given, consent_basis, marketing_status,
  marketing_status_changed_at, repeat_customer`). Auth-gated, `no-store`,
  deterministic `email` sort, RFC 4180 quoting, UTF-8 with no BOM, CRLF.
- `?filter=sendable` narrows the export to clients eligible for marketing
  email. Response headers report `X-Total-Clients` and `X-Sendable-Clients`.
- "Export for Brevo" link added to the dashboard nav on both the Jobs and Orgs
  pages.
- `clients.unsubscribed_at` replaced by `clients.marketing_status`
  (`never_asked`, `subscribed`, `unsubscribed`, `bounced`, `complained`) plus
  `marketing_status_changed_at`, which a `beforeChange` hook stamps
  automatically. A nullable date could not distinguish a dead address from a
  spam complaint, so both looked sendable.
- Send eligibility lives in one place, `isSendable()` in `src/lib/marketing.ts`:
  `marketing_consent === true && marketing_status === 'subscribed'`.
- Migration `20261021_000000_add_clients_marketing_status` creates both enums and
  the new columns, backfills from `marketing_consent` and from any existing
  `unsubscribed_at` data, then drops the old column. **Applied 2026-10-21 as
  batch 12.** The Payload CLI hung rather than running it, so the statements
  were executed directly in one transaction and the `payload_migrations` row was
  inserted to match. Investigate the CLI hang before the next migration.
- New clients default to `marketing_consent: true`, `marketing_status:
  subscribed`, `consent_basis: existing_customer_us`; both create paths
  (`client-import`, `findOrCreateClient`) set these explicitly.
- `consent_basis` (`express | existing_customer_us | none`) and
  `consent_recorded_at` record *why* an address is mailable. On 2026-10-21 all
  232 clients were set mailable as a bulk operator decision: 2 `express`, 230
  `existing_customer_us`. Pre-change values are preserved in
  `clients_consent_snapshot_20261021`.
- Any suppression status (`unsubscribed`, `bounced`, `complained`) revokes
  consent automatically via the `beforeChange` hook, so unsubscribing unticks the
  checkbox rather than leaving it checked next to a blocking status.
- `repeat_customer` is derived at export time from a count of non-`inquiry`
  jobs, so it cannot drift from job data.
- New `src/lib/csv.ts` (RFC 4180 serializer) and `src/lib/marketing.ts`, with 33
  unit tests between them.

### Phone required on intake

- Intake form phone input is now `required` (label shows "Phone *"); draft
  restore and Stripe prefill behavior unchanged.
- `/api/intake` rejects submissions without a phone server-side (400
  "Phone is required") for both full and partial submits, so browser-only
  validation can't be bypassed. Direct POSTs and legacy clients matched by
  email get their phone back-filled on update.
- Collection-level `required` deliberately **not** set on `clients.phone`:
  the Stripe POS webhook has no phone available, and a DB-level constraint
  would fail POS client creation (Stripe would retry indefinitely).
- Client CSV import now maps a `Phone` column and back-fills it on matched
  clients that lack one.

### Kanban bulk status change + localhost CSRF fix

- Dashboard: multi-select checkboxes on kanban cards with a bulk bar to change
  the status of many jobs at once. New `bulk_set_status` action on
  `/api/dashboard/actions` reports per-id successes/failures.
- Fixed: client-side fetches to dashboard action endpoints 401'd on localhost.
  Payload's cookie extraction rejects the auth cookie when `Origin` is not in
  the `csrf` whitelist (default: `serverURL` only). Whitelisted
  `http://localhost:3000`/`:3001` in `csrf` and `cors`. Full write-up in
  `docs/known-issues.md`.

## 2026-06-08

### Stripe POS webhook — invoice.updated path + dedup

Fixed: POS Terminal sales were not creating Client/Job records despite Stripe
reporting 200 OK delivery. Root causes identified and resolved:

1. **Wrong signing secret** (`STRIPE_POS_WEBHOOK_SECRET` in Vercel contained an
   incorrect value) — all 42 webhook deliveries from 6/6 returned 400. Fixed by
   copying the correct `whsec_...` from the live-mode endpoint in Stripe dashboard.

2. **Email timing race** — `payment_intent.succeeded` fires 2 seconds before the
   customer enters their receipt email on the terminal (`customer.updated`).
   `receipt_email` and `billing_details.email` are both null at delivery time;
   the handler skipped record creation silently.

**Fix:**
- `invoice.updated` (status = paid) added as the primary webhook event. By the
  time this event fires, `customer.updated` has already run and
  `invoice.customer_email` is populated.
- `extractPosFromInvoice()` added to `src/lib/stripe-pos.ts` — extracts email,
  amount, PI ID, and customer ID from the Invoice object. Handles the Stripe API
  `2025-05-28.basil` type change where `payment_intent` moved to
  `invoice.payments[]` (field still present in raw webhook JSON; accessed via
  cast).
- `payment_intent.succeeded` kept as fallback for cases where `receipt_email` is
  set directly on the intent.
- **Dedup check** added to `createPosRecord()` — looks up existing Jobs by
  `stripe_payment_intent_id` before creating; prevents duplicate records if both
  events fire for the same charge.
- Explicit `console.log` on every received event so Vercel logs always show an
  entry (previously silent returns left no trace).
- `docs/17--spec-stripe-pos-debug-2026-06-08.md` added — documents both root
  causes, the fix, and the recovery steps for missed charges.

**Action required (Stripe dashboard):** add `invoice.updated` to the subscribed
events on the `portal.petportraits.ink/api/stripe/pos` webhook endpoint.

**Recovery:** resend today's missed `invoice.updated` events manually from
Stripe Dashboard → Developers → Events.

## 2026-05-09

### Intake error capture, draft persistence, partial submit

- **Telemetry beacon** — new `POST /api/intake/events` endpoint records form events (`field_progress`, `validation_blocked`, `submit_failed`, `abandoned`) and emails Alvar for error/abandonment events, deduped once per session per type via Brevo
- **Draft persistence** — text fields auto-save to `localStorage["intake_draft"]` (500ms debounce); restored on page load with a `key`-based remount so `defaultValue` applies; cleared on successful submit
- **Partial submit CTA** — "Submit without photos" button appears when `hasPhotoError` is true; posts to `/api/intake?partial=1` (skips photo validation, adds notes prefix, sends `[partial]` email); includes IG DM link and `mailto:` link with pre-filled subject
- **IntakeEvents Payload collection** — `src/collections/IntakeEvents.ts` — admin-only read, fields: `session_id` (indexed), `event_type` (select), `form_snapshot` (json), `error_details` (json), `stripe_session_id`, `user_agent`
- **Migration** — `src/migrations/20260509_000000_add_intake_events.ts` — creates `intake_events` table + enum type + `session_id` index
- **`sanitizeSnapshot` utility** — `src/lib/sanitizeSnapshot.ts` — strips unknown keys, caps string length at 2000 chars, drops non-string values before storing snapshots
- **`sendIntakeErrorAlert`** added to `src/lib/email.ts`; `sendIntakeNotification` updated to accept `partial` flag
- **Tests** — `src/lib/__tests__/sanitizeSnapshot.test.ts` (Vitest unit, 7 cases); `tests/e2e/intake-error-capture.spec.ts` (Playwright e2e, 6 scenarios)
- `docs/spec-intake-error-capture-2026-05-09.md` — implementation spec

Open questions from spec (follow-up):
- Draft vs Stripe prefill precedence: current impl — draft wins if present
- PII retention: follow-up cron to delete intake_events rows >90 days
- Rate limiting on `/api/intake/events`: in-memory per-IP throttle

## 2026-05-01

### Intake form redesign
- Dark stone-900 background with reversed Pet Portraits logo header
- Contact link (`hi@pets.ink?subject=intake`) below logo
- All form fields, sections, and error states updated for dark theme

### Admin email notification on intake
- New `src/lib/email.ts` — `sendIntakeNotification()` calls Brevo transactional API (no new packages, plain fetch)
- Fires after job creation in `/api/intake`; failure is non-fatal and logged server-side only
- Email includes client name, email, pet name, and a direct link to the job record in Payload admin
- `docs/spec-intake-email-notification-2026-05-01.md` — provider comparison (Brevo vs Resend), implementation spec

### Page titles
- Root layout: `PetPortraits.ink` with `%s | PetPortraits.ink` template
- Per-page titles added: Commission Intake, Dashboard, Organizations, Client Import, Brevo Import, Events

### Navigation
- New `DashboardNav` component replaces scattered inline nav links across dashboard pages
- Shows active section (Jobs / Orgs), org follow-up badge, quick-create actions, Import CSV, Admin panel link
- Homepage (`/`) redirects to `/dashboard`

### Database connection pooling
- `payload.config.ts`: pool capped at `max: 3`, `idleTimeoutMillis: 10s` to avoid exhausting Supabase's 15-connection session-mode limit
- Vercel `DATABASE_URL` updated to Supabase transaction-mode pooler (port 6543, Drizzle/ORM option)
- `.env.example` updated with clear guidance on direct vs pooler connection strings per environment
- `BREVO_API_KEY` added to `.env.example`

## Unreleased (prior)

### deploy branch

- **docs** — added `docs/deploy-strategy-2026-04-21.md`. Locks deploy target to Vercel + Supabase (DB + Storage), open intake, variable Stripe amount, stacked-accordion multi-pet, signed-URL upload from day 1 (mission-critical), documented pruning/growth strategy.
- **chore** — renamed `.env-example` to `.env.example`; expanded with `PAYLOAD_ADMIN_EMAIL/PASSWORD`, commented-out Supabase S3 block, commented-out Stripe block.
- **docs** — removed Docker setup block from `README.md`; replaced with Supabase connection-string guidance.

## 2026-04-20

- `docs/project-review-2026-04-20.md` — one-pass audit of the codebase, organized around WP-intake replacement, Stripe integration, and dashboard UX priorities.

## Prior

Entries prior to the changelog's introduction (2026-04-21) are in git history — see `git log`.
