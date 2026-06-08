# Spec: direct browser upload — updated 2026-05-10

Supersedes `spec-direct-upload-2026-05-09.md`.

## Problem

Vercel Hobby caps serverless request bodies at **4.5MB**. One phone photo in portrait mode exceeds that. Vercel Pro does not fix this — the cap is the same on every plan.

## Approach

Browser uploads photos directly to Supabase Storage, bypassing Vercel entirely. The server only receives file metadata and the resulting media IDs.

### Flow

```
1. User selects photos
2. Browser  →  POST /api/intake/upload-urls  { files: [{ name, mimeType, size }] }
              ←  { uploads: [{ uploadUrl, mediaId }, ...] }

3. Browser  →  PUT {uploadUrl}  (direct to storage, no server in the middle)
              ←  200 OK

4. Browser  →  POST /api/intake  { ...formFields, mediaIds: "[1, 2, 3]" }
              ←  { success: true, jobId: 123 }
```

---

## Implementation status (2026-05-10)

Code is written and the build passes. **Not committed. Not deployed. Not tested end-to-end.**

### Done

| File | Change |
|---|---|
| `src/lib/s3.ts` | Shared S3Client singleton (SUPABASE_S3_* env vars, forcePathStyle) |
| `src/app/api/intake/upload-urls/route.ts` | New endpoint — validates metadata, creates Payload stub per file, returns presigned PUT URLs |
| `src/app/api/intake/route.ts` | Removed file upload handling; reads `mediaIds` JSON field, validates IDs exist in media collection |
| `src/app/(frontend)/intake/IntakeForm.tsx` | 3-step submit, 70MB/200MB limits, phase-aware button text |
| `package.json` | Added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` as direct deps |

### Blocking — CORS

The browser PUT to Supabase S3 requires CORS to be configured on the bucket. Supabase does **not** support the S3 `PutBucketCors` API call — attempting it returns `"The resource already exists"`. The `scripts/set-s3-cors.mjs` script was written but fails.

**Three options to resolve, in order of preference:**

**Option 1 — Test first (free, takes 5 minutes)**
Start the dev server and attempt an upload > 4MB. Supabase's S3-compatible API may already allow cross-origin PUT without explicit CORS config. If uploads succeed, CORS is already handled.

**Option 2 — Supabase Management API (one curl, need personal access token)**
```bash
curl -X PUT https://api.supabase.com/v1/projects/zvokrebwwykogwvdtvdo/config/storage \
  -H "Authorization: Bearer {SUPABASE_PERSONAL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"cors_rules":[{"allowed_origins":["https://petportraits.ink","http://localhost:3000"],"allowed_methods":["PUT"],"allowed_headers":["*"],"max_age_seconds":3000}]}'
```
Token obtained at: supabase.com → Account → Access Tokens.

**Option 3 — Switch to Supabase native signed upload URL (code change, no CORS issue)**
Supabase's own storage API (`/storage/v1/object/sign/upload/{bucket}/{key}`) returns signed upload URLs that hit Supabase's own server, which already handles CORS for all origins. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env` (not currently present). The `@supabase/supabase-js` client has `storage.createSignedUploadUrl()`.

---

## Stub tradeoff

`/api/intake/upload-urls` creates a Payload media record with a 1×1 PNG placeholder (67 bytes) for each file. This reserves a real media ID and S3 key. The browser overwrites the placeholder with the real photo via the presigned PUT.

**Result:** The S3 object is correct (real photo). The Payload DB record has wrong metadata:
- `filesize`: 67 bytes (shows incorrectly in media library)
- `width` / `height`: 1×1
- `mimeType`: image/png regardless of actual file type

Photos display correctly in admin because the URL is right. Metadata is cosmetically wrong. Acceptable for intake reference photos that are never resized programmatically.

**Fix later:** After upload confirms, call `payload.update` on each media record to correct `filesize`, `mimeType`, and dimensions. Not in scope for v1.

---

## Orphaned stubs

If upload URLs are generated but the form is never submitted (tab closed, upload failed), stub records accumulate with no job attached.

**Impact now:** Negligible — small intake volume, 67 bytes each.

**Fix later:** Cron job deleting `media` records older than 1 hour with no associated job.

---

## Limits

| Constraint | Before | After |
|---|---|---|
| Per file | 4MB (Vercel wall) | 70MB |
| Total | 4MB | 200MB |
| Bottleneck | Vercel request body | Supabase Storage (1GB free tier) |

---

## Open questions

- CORS: resolved via Option 1, 2, or 3 above
- Metadata correction after upload: deferred to follow-up
- Orphaned stub cleanup: deferred to follow-up
- Per-file upload progress bar: deferred (currently shows "Uploading photos…" phase only)
