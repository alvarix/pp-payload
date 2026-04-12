# Import Log

**Date:** 2026-04-02
**Branch:** initial-import
**CSV:** `data_import/consolidated_clients2.csv` (306 data rows)

## Schema change

- Removed `required: true` from `first_name` in `src/collections/Clients.ts`

## Dry-run updates (`._-/import-dry-run.ts`)

- Added positive status concept: `delivered`, `in_progress`, `intake_received` are "positive"
- Rows with no pet name AND no positive status produce client only (no job), tagged as "inquiry"
- Rows with a pet name OR a positive status produce both client and job
- Jobs with no pet name default to "Unknown"
- Added `tags` field to ClientRecord, writes inquiry tags to cleaned JSON
- Added inquiry count to report output

## Import script updates (`._-/import.ts`)

- Added wipe logic: deletes all jobs first, then all clients, before import (clean slate)
- Added inquiry tag support: tags from cleaned JSON are passed to the Payload API
- Defaults: empty string for missing first_name, "Unknown" for missing pet names
- Error handling: logs full error message + the data object that caused it, continues to next record
- `--dry-run` flag prevents any writes, still shows full preview

## Results

| Metric | Count |
|--------|-------|
| CSV rows parsed | 306 |
| Skipped (no email) | 21 |
| Skipped (venue headers) | 4 |
| Skipped (Venmo block) | 8 |
| Unique clients created | 126 |
| Clients tagged "inquiry" | 39 |
| Jobs created | 92 |
| Jobs skipped (dup date) | 3 |
| Errors | 0 |

## Decisions

1. **3 jobs skipped**: These had the same client + same date as an already-imported job (the duplicate guard from the original script). This is correct behavior for idempotent re-runs.

2. **95 vs 92 jobs**: The dry-run reports 95 because it doesn't check for duplicates. The live import deduplicates 3 jobs that share a client email + date with another job row.

3. **Wiping before import**: The script deletes all jobs first (to satisfy the FK constraint on clients), then all clients, then re-imports everything. This means running it twice produces the same result.

4. **.next cache issue**: First attempt hit a stale `.next` cache (`vendor-chunks/date-fns.js` missing). Resolved by deleting `.next` and restarting dev server with `pnpm dev`.

5. **"Unknown" pet names**: 44 jobs had no pet name in the CSV but had a positive status (mostly "delivered"). These get a pet entry with name "Unknown" to satisfy the `minRows: 1` constraint on the `pets` array.

---

## Leads collection + Dashboard (2026-04-10)

**Branch:** leads

### Changes
- Added `Leads` collection (`src/collections/Leads.ts`) with 4 tabs: Business Info, Contact, Qualification, Outreach
- Added `lead` relationship field to Jobs (optional, links to Leads)
- Registered Leads in `payload.config.ts`
- Created dashboard at `/dashboard` with kanban columns and quick actions
- Created seed script at `._-/seed-leads.ts`

### Migration
- Migration file created: `src/migrations/20260412_134846_leads_collection.ts`
- Could not run `pnpm payload migrate` because Postgres was not running locally
- Migration will auto-run on next `pnpm dev` start

### Workaround
- Start Postgres before running `pnpm dev`, then the migration applies automatically
- After migration, run `pnpm tsx ._-/seed-leads.ts` to populate the 15 leads from seed data
