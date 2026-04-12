# Feature Brief — What Was Built and What to Read

This document is your reading guide. Each section describes a feature, what it does, and exactly which files to open to understand how it works.

---

## 1. Dashboard (`/dashboard`)

**What it does:**
A server-rendered page showing all active jobs grouped by status, key stats, and quick actions. Authenticated — redirects to `/admin/login` if you're not logged in.

**Code to read, in order:**

1. `src/app/(frontend)/dashboard/page.tsx`
   - Start here. This is the "controller" — it fetches all the data and passes it as props to components.
   - Key concept: all `await payload.find(...)` calls happen here, server-side. Nothing hits the database from the browser.
   - Look at how `depth: 1` makes `job.client` a full object instead of just a number (line ~60).

2. `src/app/(frontend)/dashboard/components/StatsBar.tsx`
   - Pure display component. Receives numbers as props, renders cards.
   - Notice `StatCard` accepts an optional `href` — when present it wraps in `<a>`, otherwise renders as a plain `<div>`. This is a common React pattern.

3. `src/app/(frontend)/dashboard/components/JobCard.tsx`
   - Shows one job. Demonstrates how to access a populated relationship: `job.client as Client`.
   - Due date coloring: simple date math, no library.

4. `src/app/(frontend)/dashboard/components/QuickActions.tsx`
   - The only `"use client"` component in the dashboard. Everything else is server-rendered.
   - Key pattern: `useTransition` + `router.refresh()` — this is how you trigger a server re-fetch without a full page reload after a mutation.

5. `src/app/api/dashboard/actions/route.ts`
   - The API route that QuickActions POSTs to.
   - Shows how to authenticate inside an API route using `payload.auth({ headers })`.

---

## 2. Stats Bar — What Each Stat Means

| Stat | Source | Admin Link |
|---|---|---|
| Active Jobs | Jobs not in delivered/portfolio_ready | `/admin/collections/jobs` |
| Drawn / To Deliver | Jobs with `status: ready_to_ship` | Filtered jobs view |
| Awaiting Feedback | Jobs with `status: delivered` (no testimonial yet) | Filtered jobs view |
| Overdue / Stale | Jobs stuck in a status beyond a threshold (3/5/7 days) | No link — shown in OverdueAlert |
| Follow-ups Due | Leads with `followUpDate` <= today | `/admin/collections/leads` |
| Most Jobs (pills) | Top 5 clients by total job count | Each links to that client's admin record |

**Code to read:** `src/app/(frontend)/dashboard/page.tsx` lines ~70–105 (the data fetching section).

---

## 3. Leads Collection

**What it does:**
CRM for prospective event venues (breweries, pet stores, galleries, etc.). Tracks outreach status from `researched` → `confirmed` → `declined`. 28 records seeded.

**Code to read:**

1. `src/collections/Leads.ts`
   - Shows how to use Payload **tabs** to organize fields into groups in the admin UI. Compare to `Jobs.ts` which uses flat fields.
   - Notice the `events` join field at the bottom of the Outreach tab — this is a virtual field, no DB column.

2. `docs/outreach-leads-brief.md` — the original spec for this collection.

**Seed script:** `._-/seed-leads.ts`
Run: `pnpm tsx ._-/seed-leads.ts docs/all-leads-seed.json`

---

## 4. Leads ↔ Events Relationship

**What it does:**
A Lead (venue) can host multiple Events. When you confirm a Lead and schedule a pop-up, create an Event record and link it to the Lead via the "Venue (Lead)" field in the Events admin sidebar.

**Code to read:**

1. `src/collections/Events.ts` — look for the `lead` relationship field (added near the top of fields array).
2. `src/collections/Leads.ts` — look for the `events` join field inside the Outreach tab.

**How to use:**
- Admin → Events → Create or edit an event
- In the sidebar, select the venue from the "Venue (Lead)" dropdown
- Open the Lead record → Outreach tab → Events section shows all linked events

---

## 5. CSV Import — CLI Script

**What it does:**
Bulk imports clients from a CSV with columns: `First, Last, Pet, Breed, Date, Event`. Creates Clients and Jobs, matches existing clients by name.

**Code to read:** `._-/event-import.ts`
- Top ~80 lines: CSV parsing (manual, no dependencies)
- The `run()` function: shows the find-or-create pattern for clients
- The `--dry-run` flag pattern is reusable — same approach as `._-/import.ts`

**Usage:**
```bash
pnpm tsx ._-/event-import.ts data_import/my-event.csv --dry-run
pnpm tsx ._-/event-import.ts data_import/my-event.csv
```

---

## 6. CSV Import — Web UI (`/dashboard/import`)

**What it does:**
A browser-based interface for the same CSV import. Upload a file, preview what would be created, then import. No command line needed.

**Code to read:**

1. `src/app/(frontend)/dashboard/import/page.tsx`
   - Server component that fetches available event names to show a hint.
   - Renders the `<ImportForm>` client component.

2. `src/app/(frontend)/dashboard/import/ImportForm.tsx`
   - Client component with file input, preview button, and import button.
   - Uses `FileReader` API to read CSV text in the browser before sending to the API.
   - Pattern: the same data is sent to the API with `dryRun: true` or `dryRun: false`.

3. `src/app/api/dashboard/import/route.ts`
   - The API route that does the actual work. Parses CSV, finds/creates clients, creates jobs.
   - Same logic as the CLI script but adapted to run inside a Next.js API route using Payload's Local API.

---

## 7. Import Pipeline (Background)

**What it does:**
The original bulk import from `data_import/consolidated_clients2.csv` — 126 clients, 92 jobs.

**Code to read:**
1. `._-/import-dry-run.ts` — cleaning and analysis step, produces `cleaned-clients.json` and `cleaned-jobs.json`
2. `._-/import.ts` — the actual import, reads cleaned JSON, wipes DB, re-imports

**To re-run:** `pnpm tsx ._-/import.ts` (will wipe and re-import — always run dry-run first)

---

## Key Concepts Reference

**Local API vs REST API**
- Local API (`payload.find`, `payload.create`) — used in server components and API routes. Runs directly against the database, no HTTP overhead.
- REST API (`fetch('/api/...')`) — used in client components (browser) and CLI scripts.

**Why `depth: 1` matters**
Without it: `job.client` is just `5` (a number — the ID).
With `depth: 1`: `job.client` is the full Client object `{ id: 5, first_name: "Karen", ... }`.

**Server vs Client components**
Default: server. Add `"use client"` only when you need `useState`, `useEffect`, or browser event handlers. In this project: `QuickActions.tsx` and `ImportForm.tsx` are the only client components in the dashboard.
