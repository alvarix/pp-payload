# Direct upload — tradeoffs in plain English

## What we built and why

Photos used to travel: browser → Vercel server → S3 storage. Vercel caps that middle step at 4.5MB. One phone photo is already 4–8MB, so the form was basically unusable.

Now photos go: browser → S3 directly. The Vercel server only handles a tiny form submission (names, IDs, no bytes). No more size wall.

---

## The stub photo problem

To link a photo to a job, we need a Payload record with an ID before the photo is uploaded. So we create a tiny placeholder (a 1×1 transparent PNG, 67 bytes) to reserve the slot, get the ID, then tell the browser "upload the real photo to this spot."

The browser overwrites the placeholder. The photo in storage is correct. But Payload's database still thinks the file is:
- **67 bytes** (instead of the real size, e.g. 4MB)
- **1×1 pixels** (instead of the real dimensions)
- **image/png** (even if the uploaded photo is a JPEG)

**What this means in practice:** Photos display correctly in the admin — the URL points to the real file in storage. You just can't trust the file size or dimension numbers shown next to each photo in the media library. For intake reference photos that's fine; we never crop or resize them programmatically.

---

## Orphaned stubs

If a user gets presigned upload URLs but then closes the tab or the upload fails, we've created placeholder records in Payload with no job attached. They accumulate over time.

**Impact now:** Low — intake volume is small, and each stub is 67 bytes of real storage. The database rows are negligible.
[[
]]**Fix later:** A cleanup job that deletes media records older than 1 hour with no associated job. Noted in the spec as a follow-up.

---

## Why Vercel Pro doesn't help

Vercel Pro gives longer function execution time (300s vs 10s) and more memory. The request body cap (4.5MB) is the same on every plan. There is no tier that raises it. Direct upload is the correct solution regardless of plan.

---

## CORS — one-time setup

The browser can't PUT to Supabase S3 without an explicit permission rule on the bucket. This is separate from Payload's access control and from Supabase's row-level security (the "policy builder" in Supabase dashboard is RLS, not CORS).

Run `node -r dotenv/config scripts/set-s3-cors.mjs` once. Done.

---

## Summary table

| Thing | Before | After | Known issue |
|---|---|---|---|
| Per-file limit | 4MB (hard Vercel wall) | 70MB | — |
| Total limit | 4MB | 200MB | — |
| Photo metadata (size, dimensions) | Correct | Wrong (shows 67B / 1×1) | Acceptable for intake |
| Orphaned records | None | Can accumulate | Cleanup is follow-up |
| CORS config | Not needed | One-time script | Already written |
