# pp-v2

CRM and portfolio backend for a pet portrait business. Built with Payload 3 and Next.js 15, backed by PostgreSQL.

Handles client intake, job tracking, portfolio management, and events. The public-facing shop runs on a separate WordPress site - see [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) for that plugin.

## Collections

**Clients** - core CRM entity. Stores contact info, consent flags (marketing, portfolio), and tags for segmentation. A `jobs` join field gives a reverse-lookup of all jobs for a given client. Deletion is blocked if linked jobs exist.

**Jobs** - the main work unit. Each job belongs to a client and tracks:
- One or more pets (name, sex, breed, personality, social handle, reference photos)
- Job type: `street` (5-10 days to ship) or `studio` (1-2 weeks to ship)
- Status through a 7-stage workflow: `inquiry → intake_received → in_progress → awaiting_pics_or_payment → ready_to_ship → delivered → portfolio_ready`
- `pinned` flag for surfacing in the dashboard's Pinned ribbon
- Payment records (method, amount, date) and Stripe IDs
- Shipping address
- A portfolio group with images (tagged by role), testimonial, portfolio status, and featured flag

**IntakeEvents** - telemetry log for the public intake form. One row per event (`field_progress`, `validation_blocked`, `submit_failed`, `abandoned`). Admin-read-only — contains PII (email, phone). Filter by session in admin: `/admin/collections/intake-events?where[session_id][equals]=<uuid>`.

**Organizations** - outreach pipeline for pop-up event collaborations. Tracks business info, qualification (dog-friendly, event space, pop-up history), fit scoring (`top_tier`, `strong`, `worth_trying`), a `pinned` flag, and primary + additional contacts (each with notes). Outreach status: `researched → contacted → opened_email → responded → meeting_scheduled → upcoming_event → ongoing_relationship → past_collaborator → declined → no_response`. Organized in tabs: Business Info, Contact, Qualification, Outreach.

**Events** - calendar/marketing events with slug, dates, location, rich text description, image, and publish status.

**Media** - image and video uploads with sharp resizing. Mime types restricted to `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `video/mp4`, `video/quicktime`. Alt text is auto-generated from filename on upload.

**Users** - admin authentication.

## Dashboard

`/dashboard` — job workflow board grouped by status, with stats, quick actions, and a Pinned ribbon at the top. Each card has pin (★) and delete (×, with confirm) actions.

`/dashboard/organizations` — organizations pipeline. Top: Pinned ribbon (any pinned org) and Top Tier band (orgs with `fitScore = top_tier`, tabbed by state). Columns by status: Contacted, Opened Email, Responded, Researched, Upcoming Event, Ongoing Relationship, Past Collaborators, plus Other (catches `meeting_scheduled`, `declined`, `no_response`). Column order is drag-reorderable and persists per browser. Each card shows status select, fit-score select, pin/delete actions, a notes preview that expands inline, and contact notes per primary + additional contact.

`/dashboard/client-import` — CSV importer for post-event client intake. Columns: `Email, First, Last, Pet, Breed, Event, Type, Status, Job Notes, Client Notes, Referral`. Supports paste/file or a per-field form. Column chips are shown before upload — hover for per-field notes, click × to exclude. Due date is today + shipping window (street +7 days, studio +10 days).

## API routes

`POST /api/intake` - public intake form endpoint. Accepts client contact info, pet data, and photo uploads. Enforces 10MB per file, 10 files max, 70MB total. Add `?partial=1` to skip photo validation — creates the job anyway with a notes prefix indicating photos are pending via IG/email. Creates or updates the client by email and creates a job.

`POST /api/intake/events` - unauthenticated telemetry endpoint. Accepts `{ type, sessionId, snapshot, error }` and creates a row in `intake-events`. Sends an alert email to Alvar for `submit_failed`, `validation_blocked` (≥30s with photo error), and `abandoned` events, deduped once per session per type. Always returns HTTP 200 so telemetry failures never block the form.

`POST /api/dashboard/actions` - auth-protected. Job actions: `set_status`, `toggle_pics_received`, `toggle_pinned`, `delete`.

`POST /api/dashboard/org-actions` - auth-protected. Org actions: `set_status`, `set_fit_score`, `toggle_pinned`, `delete`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| CMS | Payload 3.72 |
| Database | PostgreSQL 16 via `@payloadcms/db-postgres` |
| Styling | Tailwind CSS 4 |
| Rich text | Lexical |
| Language | TypeScript 5.7 |
| Runtime | Node 20+ |
| Package manager | pnpm 9+ |

## Local setup

### Prerequisites

- Node >= 20.9.0
- pnpm >= 9
- A Supabase project (free tier is fine). Postgres runs there — no local DB / Docker needed.

### Environment

Copy `.env.example` to `.env` and fill in the values. At minimum:

```env
DATABASE_URL=postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres
PAYLOAD_SECRET=your-secret-here
PAYLOAD_ADMIN_EMAIL=admin@example.com
PAYLOAD_ADMIN_PASSWORD=your-admin-password
```

Get `DATABASE_URL` from the Supabase dashboard: Settings → Database → Connection string.

### Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). First visit prompts for admin user creation.

Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

### Scripts

```bash
./db-backups/db-backup.sh   # pg_dump to db-backups/backup_<ts>.sql (run before migrations)
pnpm dev              # start dev server
pnpm devsafe          # clear .next cache and start
pnpm build            # production build
pnpm start            # serve production build
pnpm generate:types   # regenerate payload-types.ts after schema changes
pnpm lint             # ESLint
pnpm test             # all tests (integration + e2e)
pnpm test:int         # Vitest integration tests
pnpm test:e2e         # Playwright e2e tests
```

### Data import

Import scripts live in `data_import/`. All require the dev server to be running.

```bash
# Import client leads (past collaborators) into the Clients collection
PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-leads.mjs

# Import all organizations (past collaborators + prospects) into the Organizations collection
PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-all-leads.mjs

# Dry run either script (prints what would be created, no changes)
DRY_RUN=1 PAYLOAD_EMAIL=admin@example.com PAYLOAD_PASSWORD=yourpassword \
  node data_import/import-all-leads.mjs
```

| Script | Target collection | Data file | Deduplicates on |
|---|---|---|---|
| `import-leads.mjs` | Clients | `leads.json` | email |
| `import-all-leads.mjs` | Organizations | `all-leads-seed.json` | name |

## Project structure

```
src/
  app/
    (frontend)/         Public-facing pages (intake form, events)
    api/                Custom API routes
  collections/          Payload collection definitions
  payload.config.ts
  payload-types.ts      Auto-generated - do not edit manually
data_import/            CSV migration scripts from legacy system
docs/                   Internal documentation
tests/                  Vitest integration + Playwright e2e
```

## Production deployment

Deployed to Vercel at `portal.petportraits.ink`, backed by Supabase Postgres + Supabase S3. Required env vars on Vercel (Production scope):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Supabase pooler URL, port 5432 |
| `PAYLOAD_SECRET` | Session signing key |
| `STRIPE_SECRET_KEY` | LIVE mode key. Use a dedicated key (separate from any other Stripe consumer like WordPress) so blast radius is contained on rotation. |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_BUCKET` | S3-compatible storage config |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | S3 credentials |

For the full pre/post-launch checklist and known risks, see [`docs/launch-checklist-2026-04-24.md`](docs/launch-checklist-2026-04-24.md).

### Supabase free tier limits

Both the database and file storage run on Supabase's free plan:

| Resource | Free limit | Risk at limit |
|---|---|---|
| File storage | 1 GB | Project paused — intake form returns 500 |
| Database | 500 MB | Project paused |
| Bandwidth | 5 GB/month | Project paused |
| Inactivity | 7 days no DB queries | Project paused |

At ~30–50 MB per intake submission (up to 10 photos), the 1 GB storage cap is hit after roughly 20–30 jobs. Monitor usage in the Supabase dashboard under Storage.

**To avoid pausing without upgrading to Pro ($25/month):**
- Set up a free uptime monitor (e.g. UptimeRobot) pinging the site every 5 minutes — this keeps the DB active and prevents inactivity pausing.
- Replace Supabase S3 storage with **Cloudflare R2**: 10 GB free, no egress fees, $0.015/GB beyond that. Both use the S3-compatible API so the storage adapter config requires only credential changes.
- Compress reference photos on upload using `sharp` (already a dependency) before writing to storage — typical phone photos compress 60–80% without visible quality loss.

The Pro plan ($25/month) removes all of the above risks and is the straightforward production choice once jobs are flowing regularly.

## Security notes

- `pp-wp` and `pp-wp.pub` in the project root are SSH keys used for server communication. **These must not be committed to version control.** Add them to `.gitignore` and store securely.
- **Collection read access is open** (`() => true`) on Clients, Jobs, Organizations, and Media. Payload's auto-generated REST/GraphQL endpoints make this PII queryable by unauthenticated visitors. Lock down before public launch — see launch checklist risk #1.
- `/api/intake` is unauthenticated by design (it's the public form endpoint), but trusts only the Stripe session ID and re-verifies server-side. Upload limits: 10MB per file, 10 files max, 70MB total (enforced client- and server-side). The Media collection enforces a mime-type allowlist. There is still no rate limit — see launch checklist risk #3.
- Stripe secret keys must never appear in chat transcripts, screenshots, or commit messages. If exposed, roll the key in Stripe immediately and update Vercel + any other consumer.

## WordPress integration

This backend pairs with the [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) WordPress plugin, which handles the public adoption shop. The two systems are separate deployments. Clients who complete a purchase through WordPress can be looked up or created here via the `/api/intake` endpoint.
