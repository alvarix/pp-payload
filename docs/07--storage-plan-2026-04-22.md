# Supabase Storage — Phase A Plan — 2026-04-22

Parent: `docs/deploy-strategy-2026-04-21.md` Decision 3. Scope: move pet photo persistence from the local `media/` folder to Supabase Storage, then enable signed-URL direct uploads from the intake form.

Mission-critical posture means: intake uploads must not fail under Vercel's 10s function timeout. That rules out a simple "stream through the serverless function to Supabase" pattern for anything larger than a few MB total.

## Current state

- `src/collections/Media.ts` uses `upload: true` with no custom storage plugin. Payload defaults to writing to `./media/` on the local filesystem.
- 14 files on disk in `/Users/alvarsirlin/Sites/pp/media/` (1–3 MB HEIC + JPG/PNG).
- Media table on Supabase has 14 rows; `url` field is `/api/media/file/<filename>` (Payload's local-file endpoint).
- No object storage configured yet — Supabase project is `zvokrebwwykogwvdtvdo` ("PL - PP").

**Breaks on Vercel as-is.** The Vercel filesystem is ephemeral per-deploy and read-only within a function. No fix without object storage.

## Staged approach

Split the phase into two sub-phases so we can ship persistence quickly and then layer on the direct-upload flow.

### A.1 — Plugin wiring + backfill existing files (fastest, unblocks Vercel)

- Install `@payloadcms/storage-s3`.
- Configure plugin against Supabase Storage S3 endpoint.
- Existing admin-panel upload flow continues to work but now writes to Supabase.
- Existing intake form continues to work but now streams bytes through the serverless function into Supabase (still subject to 10s timeout for big batches; fine for low-count submissions pending A.2).
- Migrate the 14 existing files from local disk into the bucket, update their `url` fields.
- After this lands: deploy to Vercel works end-to-end for admin usage and small intake submissions.

### A.2 — Signed-URL direct browser upload (fixes 10s timeout)

- New endpoint `/api/intake/upload-url` returns a batch of presigned PUT URLs.
- IntakeForm uploads each photo directly from browser to Supabase.
- Form POSTs to `/api/intake` with object keys only — no file bytes through the serverless function.
- `/api/intake` creates Media records referencing keys (filename, size, mime captured at URL-request time, validated at PUT time via Supabase's signed-URL constraints).
- Retry with exponential backoff on transient upload failure (per `docs/deploy-strategy-2026-04-21.md`).
- After this lands: intake is robust to arbitrary photo sizes, Vercel 10s timeout is no longer a failure path.

A.1 alone is enough to get **something** live; A.2 is required before we flip WP over to the new form at scale.

## User setup (before A.1 code lands)

You do this once in the Supabase dashboard. Not automatable from my side.

1. **Create a bucket named `media`** (project `PL - PP` → Storage → Create bucket).
   - Public: **No** (private). We'll serve via signed-read URLs or a public-read policy scoped to `media/*` later if we want direct linking.
2. **Get S3 credentials.** Project → Settings → Storage → **S3 Connection** → enable and reveal. You'll get:
   - Endpoint (e.g. `https://zvokrebwwykogwvdtvdo.supabase.co/storage/v1/s3`)
   - Region (pick the project's region, e.g. `us-east-1`)
   - Access Key ID + Secret Access Key
3. **Paste into `.env`:**
   ```
   SUPABASE_S3_ENDPOINT=...
   SUPABASE_S3_REGION=us-east-1
   SUPABASE_S3_ACCESS_KEY_ID=...
   SUPABASE_S3_SECRET_ACCESS_KEY=...
   SUPABASE_S3_BUCKET=media
   ```
4. **Vercel project env vars** (later, when we deploy): same 5 vars set in Vercel's project settings.

## Open questions

1. **Public vs private bucket.** Admin panel previews need to render the images. Options:
   - (a) Private bucket, Payload serves via signed-read URLs on each request (adds signing latency; most secure).
   - (b) Public bucket (read-only on `media/*`), Payload stores direct Supabase URLs (fastest; exposes all uploaded photos to anyone who guesses a key).
   - (c) Private bucket, admin panel uses signed reads; public portfolio pages bake in longer-lived signed URLs at build-time.
   Recommendation: **(c)** — matches "pet photos are private until curated into portfolio" product intuition. But (b) is simpler if you're OK with "anyone with the URL can see the photo" (photos are already effectively public once the customer emails them to you via any channel).
2. **Existing 14 files — migrate or leave?** All 14 are dev/test uploads. Quickest: delete rows + files, start fresh. Cleanest: script that uploads each local file to Supabase and updates the row. Recommend **delete + restart** given they're test data.
3. **Orphan pruning — when?** Addressing it here vs deferring to a follow-up pass. Not urgent — can ship A.1/A.2 without it. Recommend deferring until after production cutover.

## A.1 execution plan

| # | Task | Files | Test |
|---|---|---|---|
| 1 | Install `@payloadcms/storage-s3` | `package.json`, `pnpm-lock.yaml` | `tsc --noEmit` clean |
| 2 | Configure plugin in `payload.config.ts` reading 5 `SUPABASE_S3_*` env vars | `payload.config.ts`, `.env.example` | Dev server boots |
| 3 | Decide on bucket access mode (public / private / hybrid — open question 1) | — | Documented decision |
| 4 | Start dev server, upload a file via Payload admin, confirm it appears in the Supabase bucket (not on local disk) | manual | Supabase dashboard shows the file |
| 5 | Submit the existing intake form with a small photo, confirm the Media record's `url` points at Supabase | manual | Admin preview renders from Supabase URL |
| 6 | Purge the 14 existing dev test rows + local `media/` folder (open question 2) | manual | `/media` table empty; local folder gone |

## A.2 execution plan (drafted after A.1 ships)

Not expanded yet — will produce a separate plan doc once A.1 decisions land.

## Risks

- **Plugin misconfiguration silently falls back to local filesystem.** Test step 4 must verify in the bucket, not just that the upload "worked".
- **Admin panel CORS.** If bucket is private + admin reads via signed URLs, the Supabase S3 endpoint needs CORS configured to allow the admin origin. Signed reads from a different domain are a common source of broken thumbnails.
- **MIME / size validation still missing** (project-review §A1). Adding object storage doesn't add file validation — attackers can still upload 100 MB files. Batch with the Zod pass.

## Iteration

- 2026-04-22 — initial draft. Awaiting user on: bucket access mode (Q1), backfill vs purge existing files (Q2).
