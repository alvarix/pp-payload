# Changelog

Notable changes to `pp-v2`. Dates in YYYY-MM-DD.

## Unreleased

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
- Contact link (`alvar@petportraits.ink?subject=intake`) below logo
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
