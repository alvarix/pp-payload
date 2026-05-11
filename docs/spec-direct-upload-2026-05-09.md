# Spec: direct browser upload for intake photos

## Problem

Vercel Hobby plan caps serverless function request bodies at **4.5MB total**. The intake form currently sends photos through `/api/intake` as multipart/form-data, which means every photo byte passes through the serverless function. This caps usable photo uploads to ~4MB — a single phone photo in portrait mode.

The current 4MB client-side limit (`MAX_TOTAL_BYTES`) is a band-aid. It prevents silent failures but makes the form nearly unusable for anyone with a modern phone camera.

## Solution: signed-URL direct upload

Upload photos from the browser directly to Supabase S3, bypassing the serverless function entirely. The server only receives media IDs, not the files themselves.

### Flow

```
1. User selects photos
2. Browser  →  POST /api/intake/upload-urls   { count: 3, mimeTypes: [...] }
              ←  { uploads: [{ uploadUrl, mediaId }, ...] }

3. Browser  →  PUT {uploadUrl}  (direct to Supabase S3, no server in the middle)
              ←  200 OK  (from Supabase)

4. Browser  →  POST /api/intake  { ...formFields, mediaIds: [1, 2, 3] }
              ←  { success: true, jobId: 123 }
```

### What changes

**New endpoint — `POST /api/intake/upload-urls`**
- Accepts `{ files: [{ name, mimeType, size }] }` — no actual bytes
- Validates file count (≤10), mimeTypes (image/* only), individual size (≤70MB each), total size (≤200MB)
- For each file, creates a `media` record in Payload (stub, no data yet) and generates a presigned S3 PUT URL via `@aws-sdk/s3-request-presigner`
- Returns `[{ uploadUrl, mediaId }]` — URLs expire in 15 minutes

**Updated `POST /api/intake`**
- Accepts `mediaIds` JSON field instead of `pet_pics` file uploads
- Validates that each ID exists in the `media` collection and belongs to no existing job (prevents ID reuse)
- Links IDs to the job's `pets[0].pics` array
- No file handling, no size constraints — request body is tiny

**`IntakeForm.tsx`**
- On file select: call `/api/intake/upload-urls`, upload each file directly via `fetch(uploadUrl, { method: "PUT", body: file })`
- Show per-file upload progress (XHR or fetch with streams)
- On submit: send `mediaIds` as a JSON field instead of files
- `hasPhotoError` stays for count/type validation; size limits go back to 70MB per file / 200MB total (actual S3 limits)
- Keep partial submit path for when the user has no photos at all

### Supabase S3 presigned URLs

Use `@aws-sdk/s3-request-presigner` with `PutObjectCommand`. The same credentials already in env (`SUPABASE_S3_*`) work for generating presigned URLs server-side.

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  region: process.env.SUPABASE_S3_REGION,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const url = await getSignedUrl(
  s3,
  new PutObjectCommand({
    Bucket: process.env.SUPABASE_S3_BUCKET,
    Key: `media/${mediaId}/${filename}`,
    ContentType: mimeType,
  }),
  { expiresIn: 900 }, // 15 minutes
);
```

### New package required

```bash
pnpm add @aws-sdk/s3-request-presigner @aws-sdk/client-s3
```

(The storage adapter already uses S3 internally; these packages add client-side presigned URL generation.)

### Limits after this change

| Constraint | Current (band-aid) | After direct upload |
|---|---|---|
| Per file | 4MB | 70MB |
| Total | 4MB | 200MB (configurable) |
| Bottleneck | Vercel request body | Supabase S3 storage (1GB free) |

### Orphaned media cleanup

If the user generates presigned URLs but never completes the form submit, media stub records accumulate with no job attached. Options:
- Cron: delete `media` records older than 1 hour with no associated job
- On upload-urls endpoint: delete prior stubs for same session

Track as a follow-up — low volume for now.

### CORS

Supabase S3 (self-hosted Minio under the hood) needs a CORS policy to allow PUT from the intake domain. Set in Supabase Storage settings or via the S3 API:

```json
[{
  "AllowedOrigins": ["https://petportraits.ink", "http://localhost:3000"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```

### Effort

- `/api/intake/upload-urls` endpoint: 1h
- Updated `/api/intake` to accept `mediaIds`: 30min
- `IntakeForm.tsx` upload flow + progress UI: 2h
- CORS config + testing: 30min
- Orphaned media cron (optional v1): 30min

Total: ~4–4.5 hours

## Status

**Decided: implement direct upload.** Vercel Pro was ruled out. Direct upload removes the platform dependency entirely.

4MB client + server limits are in place as a bridge (`MAX_FILE_BYTES`, `MAX_TOTAL_BYTES` in `IntakeForm.tsx` and `route.ts`). Remove those constants and restore 10MB/70MB once direct upload lands.

## Open questions

- Should upload progress be shown per-file or as a single combined bar?
- Should files upload immediately on select (faster) or only when submit is clicked (more expected)?
- Recommendation: upload on submit — users often change their selection.
