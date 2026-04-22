# pp-v2

CRM and portfolio backend for a pet portrait business. Built with Payload 3 and Next.js 15, backed by PostgreSQL.

Handles client intake, job tracking, portfolio management, and events. The public-facing shop runs on a separate WordPress site - see [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) for that plugin.

## Collections

**Clients** - core CRM entity. Stores contact info, consent flags (marketing, portfolio), and tags for segmentation. A `jobs` join field gives a reverse-lookup of all jobs for a given client. Deletion is blocked if linked jobs exist.

**Jobs** - the main work unit. Each job belongs to a client and tracks:
- One or more pets (name, sex, breed, personality, social handle, reference photos)
- Job type: `street` (5-10 days to ship) or `studio` (1-2 weeks to ship)
- Status through a 7-stage workflow: `inquiry → intake_received → in_progress → ready_to_ship → awaiting_pics_or_payment → delivered → portfolio_ready`
- Payment records (method, amount, date) and Stripe IDs
- Shipping address
- A portfolio group with images (tagged by role), testimonial, portfolio status, and featured flag

**Organizations** - outreach pipeline for pop-up event collaborations. Tracks business info, contact details, qualification (dog-friendly, event space, pop-up history), fit scoring, and outreach status through a 7-stage workflow: `researched → contacted → responded → meeting_scheduled → confirmed → declined → no_response`. Organized in tabs: Business Info, Contact, Qualification, Outreach.

**Events** - calendar/marketing events with slug, dates, location, rich text description, image, and publish status.

**Media** - image uploads with sharp resizing. Alt text is auto-generated from filename on upload.

**Users** - admin authentication.

## Dashboard

`/dashboard` — job workflow board grouped by status, with stats and quick actions.

`/dashboard/organizations` — organizations pipeline. Columns: Current (confirmed + upcoming event), Past Collaborators (confirmed, no upcoming event), Prospects (researched, sorted by fit score), Contacted, Responded. Move an organization between columns by changing its Status in admin; Current vs Past is determined automatically by whether a linked Event exists with a future date.

`/dashboard/client-import` — CSV importer for post-event client intake. Columns: `Email, First, Last, Pet, Breed, Event, Type, Status, Job Notes, Client Notes, Referral`. Supports paste/file or a per-field form. Column chips are shown before upload — hover for per-field notes, click × to exclude. Due date is today + shipping window (street +7 days, studio +10 days).

## API routes

`POST /api/intake` - public intake form endpoint. Accepts client contact info, pet data, and photo uploads. Creates or updates the client by email and creates a job. Used by the intake form at `/intake`.

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
./db-backup.sh        # pg_dump to timestamped .sql file (run before migrations)
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

## Security notes

- `pp-wp` and `pp-wp.pub` in the project root are SSH keys used for server communication. **These must not be committed to version control.** Add them to `.gitignore` and store securely.
- All collections currently have open read access (`() => true`). Role-based access control should be implemented before exposing the API publicly.
- The intake endpoint is unauthenticated - consider adding an API key check for production.

## WordPress integration

This backend pairs with the [bulk-cpt-pay](https://github.com/alvarix/bulk-cpt-pay) WordPress plugin, which handles the public adoption shop. The two systems are separate deployments. Clients who complete a purchase through WordPress can be looked up or created here via the `/api/intake` endpoint.
