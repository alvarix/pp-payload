# Architecture Guide

## System overview

This is a Payload 3 CMS (Next.js 15 + Postgres) for a solo pet portrait artist. It manages three workflows:

1. **Commissions** -- client submits an intake form, a job is created, the artist tracks it through statuses from "new" to "delivered" to "portfolio ready".
2. **Events / Leads** -- the artist researches venues (breweries, pet stores, etc.) for pop-up events, tracks outreach status, and links confirmed events to jobs.
3. **Intake form** -- a public-facing form at `/intake` that creates a client + job in one step.

The admin panel at `/admin` is the primary interface for managing data. The dashboard at `/dashboard` provides a kanban-style overview of active jobs.

---

## Payload collections and relationships

```
  Users
    |
    | (auth)
    v
  Clients  <------  Jobs  ------> Media (pet pics, portfolio images)
    |                 |
    | (tags[])        | (lead?)
    v                 v
  [tag array]       Leads
                      |
                      v
                    Events (linked via lead field)
```

- **Users** -- admin accounts (Payload auth)
- **Clients** -- people who commission portraits. Has email (unique), name, phone, tags, consent flags
- **Jobs** -- a single commission. Belongs to one Client. Contains pets array, status workflow, payment info, shipping address, portfolio group. Optionally links to a Lead
- **Leads** -- prospective venues being researched for pop-up events. Internal CRM data: business info, contact details, qualification scores, outreach tracking. Status progresses from researched -> contacted -> confirmed -> declined etc.
- **Events** -- confirmed pop-up occurrences (public-facing). Linked to a Lead via the `lead` relationship field. One Lead can have many Events (return visits). The Lead's Outreach tab shows all linked Events via a join field.
- **Media** -- uploaded files (images). Referenced by Jobs for pet pics and portfolio images

---

## Leads and Events relationship

A **Lead** represents a prospective venue (brewery, pet store, gallery, etc.) being researched for hosting pop-up portrait events. Leads are internal CRM data -- they track outreach status, contact info, and qualification scoring. They are not public-facing.

An **Event** represents a confirmed pop-up occurrence. Events are public-facing (calendar listings, etc.) and contain the actual date, location, and status.

The relationship is **one Lead to many Events**. A single venue can host multiple pop-ups over time (return visits).

**Workflow:**

1. Research a venue and create a Lead (status: `researched`)
2. Track outreach through `contacted` -> `responded` -> `confirmed`
3. Once confirmed, create an Event record
4. Link the Event to the Lead using the `lead` field on the Event (sidebar)
5. The Lead's Outreach tab automatically shows all linked Events via the `events` join field

**Schema details:**

- `Events.lead` -- optional relationship field pointing to `leads` collection
- `Leads.events` -- virtual join field (read-only), shows all Events where `event.lead === lead.id`

---

## Event CSV import

The `._-/event-import.ts` script imports post-event client data from a CSV file, creating Client and Job records.

**CSV columns:**

| Column | Description |
|--------|-------------|
| `First` | Client first name |
| `Last` | Client last name |
| `Pet` | Pet name |
| `Breed` | Pet breed |
| `Date` | Date of event/purchase |
| `Event` | Event name (matched against existing Events) |

**Behavior:**

- Matches clients by first + last name (case-insensitive). Creates new clients if no match found (with a placeholder email).
- Matches events by title (case-insensitive partial match). Does NOT auto-create events -- unmatched event names are reported.
- Creates a Job per row with pet info, date, and status (`delivered` if past, `new` otherwise).
- The Event column value is stored in the job's notes for reference.

**Usage:**

```bash
# Preview what would be created
pnpm tsx ._-/event-import.ts data_import/my-event.csv --dry-run

# Live import
pnpm tsx ._-/event-import.ts data_import/my-event.csv
```

**Env vars:** `PAYLOAD_ADMIN_EMAIL`, `PAYLOAD_ADMIN_PASSWORD`, `PAYLOAD_URL` (default `http://localhost:3001`)

---

## How Payload types work

`src/payload-types.ts` is auto-generated from your collection configs. Never edit it by hand.

After changing any collection schema, run:

```bash
pnpm generate:types
```

This reads every `CollectionConfig` and produces TypeScript interfaces. For example, this field in `Leads.ts`:

```ts
{ name: "fitScore", type: "select", options: [...] }
```

becomes this in `payload-types.ts`:

```ts
fitScore?: 'top_tier' | 'strong' | 'worth_trying' | null;
```

You can then import and use these types:

```ts
import type { Lead } from '@/payload-types'
const score: Lead['fitScore'] = 'top_tier'
```

---

## Local API vs REST API

Payload exposes two ways to read/write data:

**Local API** (server-side only):
```ts
const payload = await getPayload({ config })
const { docs } = await payload.find({ collection: 'jobs', ... })
```
- Used in: server components, API route handlers, server actions
- No HTTP overhead, runs in the same process
- Has full access to hooks and auth context

**REST API** (HTTP):
```ts
await fetch('/api/leads', { method: 'POST', body: JSON.stringify(data) })
```
- Used in: client components (`"use client"`), external scripts (seed, import)
- Requires auth token in `Authorization: JWT <token>` header
- Also used by the admin panel itself

**Rule of thumb:** use Local API whenever you can (server components, route handlers). Use REST API only from client components or standalone scripts.

---

## depth in queries

When a field is `type: "relationship"`, Payload stores only the related document's ID by default. The `depth` parameter controls how many levels of relationships get populated.

**depth: 0** (default):
```json
{ "client": 42, "status": "in_progress" }
```

**depth: 1**:
```json
{
  "client": {
    "id": 42,
    "email": "jane@example.com",
    "first_name": "Jane",
    "last_name": "Doe"
  },
  "status": "in_progress"
}
```

The dashboard uses `depth: 1` on the jobs query so `job.client` is a full Client object, which lets us display the client name on each job card without a second query.

---

## Server vs client components

Next.js 15 rule: **server by default, client only when needed.**

Server components can:
- Fetch data directly (no API call needed)
- Access the filesystem, environment variables
- Cannot use `useState`, `useEffect`, `onClick`, etc.

Client components (`"use client"` directive) are needed for:
- User interaction (button clicks, form inputs)
- Browser APIs
- React state and effects

**Example: the QuickActions pattern**

The dashboard page and all card/column components are server components. They fetch data and render HTML. But the "Mark Delivered" buttons need `onClick` handlers, so `QuickActions.tsx` is a client component:

```ts
"use client";
// Can use useRouter, useTransition, onClick
export function QuickActions({ jobId, currentStatus }) { ... }
```

It POSTs to `/api/dashboard/actions` (a Next.js route handler that uses the Local API), then calls `router.refresh()` to re-render the server components with fresh data.

---

## Import pipeline

The `._-/` directory contains import/seed scripts:

1. **`._-/import-dry-run.ts`** -- preview what would be imported without writing
2. **`._-/import.ts`** -- reads `data_import/cleaned-clients.json` and `data_import/cleaned-jobs.json`, wipes existing data, then creates clients and jobs via REST API
3. **`._-/seed-leads.ts`** -- reads `docs/outreach-leads-seed.json` and creates Lead records (idempotent, skips duplicates by name)

The cleaned JSON files are pre-processed from CSV exports. To re-run an import:

```bash
# Start dev server first
pnpm dev

# In another terminal:
pnpm tsx ._-/import.ts --dry-run   # preview
pnpm tsx ._-/import.ts              # live import
pnpm tsx ._-/seed-leads.ts          # seed leads
```

---

## Dashboard data flow

```
page.tsx (server)
  |-- fetches jobs, clients, leads via Local API
  |-- groups jobs by status
  |-- detects stale jobs
  |-- passes typed props down
  |
  +-- StatsBar (server) -- renders stat cards
  +-- OverdueAlert (server) -- renders stale job banner
  +-- StatusColumn[] (server) -- one per active status
       |
       +-- JobCard[] (server) -- client name, pets, due date
            |
            +-- QuickActions (CLIENT) -- buttons with onClick
                 |
                 POST /api/dashboard/actions
                 |
                 route.ts (server) -- uses Local API to update job
                 |
                 router.refresh() -- re-renders server components
```

All data fetching happens once in `page.tsx`. Components receive plain props. The only client-side code is the button interactions in `QuickActions`.
