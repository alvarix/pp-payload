Pre-launch hardening, deploy checklist, and post-launch sanity for the public intake going live at `portal.petportraits.ink`.

## Bug & risk register (ranked by severity)

### CRITICAL — block launch

1. **Public read access on Clients, Jobs, Organizations, Media collections**
   `src/collections/{Clients,Jobs,Organizations,Media}.ts` all set `access.read: () => true`. Payload exposes `/api/{collection}` REST and `/api/graphql` by default, so any unauthenticated visitor can dump every client email, phone, address, every job's pet info and shipping address, and every org's contact details. This is PII exposure at scale.
   **Fix**: change `read` to `({ req }) => Boolean(req.user)` on Clients, Jobs, Organizations. Media may need to stay public if any frontend pages render images directly — verify by grepping public pages for `<Media>` or direct media URLs.

2. **Stripe `wp-config` secret key was exposed in this session's chat transcript**
   The full `sk_live_51Rezof...` string appeared in conversation. Roll it in Stripe → update WordPress with the new value. (Already removed `STRIPE_SECRET_KEY_TEST` from Vercel; the production key in Vercel is whatever you wired up next — if you're now using the `Payload`-labeled key this isn't urgent for *this* app, but the WordPress side still needs the rotation.)

### HIGH — fix before launch

3. **No server-side file size limit on `/api/intake`**
   `src/app/api/intake/route.ts:74-90` reads `file.arrayBuffer()` for every uploaded photo with no size check. An attacker can POST 100 × 100MB files and exhaust memory or run up Supabase S3 bills. Browser-side limits are bypassable.
   **Fix**: reject any `file.size > 10 * 1024 * 1024` (10MB) before reading the buffer.

4. **No MIME-type allowlist on uploads**
   Same route trusts `file.type` from the browser, which is client-supplied. Payload's Media collection has no `mimeTypes` config either.
   **Fix**: add `mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']` to `Media.upload` config in `src/collections/Media.ts`.

5. **Pre-launch DB snapshot**
   Live DB is shared with WordPress data. Run `./db-backup.sh` immediately before flipping the Stripe redirect URLs. If anything explodes you have a known-good rollback point.

### MEDIUM — fix in first week

6. **No rate limiting on `/api/intake`**
   Public unauthenticated POST that creates DB rows and uploads to S3. A spam loop costs you DB writes + S3 storage + Stripe API calls.
   **Fix**: simple in-memory token bucket keyed by IP, or use Vercel's edge config / Upstash for distributed limiting. 5 requests / IP / minute is generous for a real flow.

7. **Dashboard routes leak raw exception messages**
   `/api/dashboard/actions` and `/api/dashboard/org-actions` return `e.message` on 500. Auth-gated so blast radius is small, but database error strings can include schema/SQL detail.
   **Fix**: log full error server-side, return `{ error: 'Internal error' }` to client.

8. **Filenames written to S3 without sanitization**
   `file.name` from the form goes straight to Payload, which uses it for the S3 key. Unicode tricks, path traversal characters (`../`), or duplicate names from different clients can collide.
   **Fix**: Payload usually slugifies, but verify by uploading `../../evil.png` and `日本語.jpg` and checking the resulting S3 key.

### LOW — backlog

9. **No Stripe webhook for refunds / disputes / payment status changes**
   Once a Job is created, Stripe state changes (refund, chargeback, payment_intent.payment_failed for delayed methods) don't sync back. Manual reconciliation only. `STRIPE_WEBHOOK_SECRET` is mentioned in `.env.example` but not wired up — misleading; either implement or remove the line.

10. **Test gaps**
    No tests for CSV import routes (`/api/dashboard/client-import`, `/api/dashboard/brevo-org-import`), no tests for dashboard mutations, no auth-bypass regression tests on dashboard endpoints.

11. **Stripe `_client` singleton not mode-aware**
    Currently fine because we only use one mode per environment. If you ever need to support both modes in one process, `src/lib/stripe.ts:78-87` needs a per-mode cache.

---

## Pre-launch checklist

### Code & config

- [ ] Lock down `Clients`, `Jobs`, `Organizations` `access.read` to authenticated users only (risk #1)
- [ ] Verify `Media.access.read` actually needs to be public (which frontend pages render media URLs?)
- [ ] Add 10MB per-file size limit in `/api/intake` (risk #3)
- [ ] Add MIME-type allowlist on `Media` collection (risk #4)
- [ ] Rotate the leaked `wp-config` Stripe key, update WordPress (risk #2)
- [ ] Confirm production `STRIPE_SECRET_KEY` on Vercel = the `Payload`-labeled key (separation from WordPress)
- [ ] Run `./db-backup.sh` and verify the dump file is non-empty

### Vercel env vars (verify all present in Production scope)

- [ ] `DATABASE_URL` (Supabase pooler URL, port 5432)
- [ ] `PAYLOAD_SECRET`
- [ ] `STRIPE_SECRET_KEY` (live, `Payload`-labeled key, post-rotation)
- [ ] `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_BUCKET`
- [ ] `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`
- [ ] No `STRIPE_SECRET_KEY_TEST` (already removed)

### Stripe dashboard (LIVE mode)

- [ ] For every active Payment Link: success URL → `https://portal.petportraits.ink/intake?session={CHECKOUT_SESSION_ID}`
- [ ] For every active Payment Link: `metadata.job_type` set to `street` or `studio`
- [ ] If using shipping rates: pickup options have "pickup" in their display name (drives `delivery_method` mapping)
- [ ] Phone number collection enabled if you want phone prefilled on intake
- [ ] Automatic tax enabled if you want tax tracked on Jobs

### Smoke test (real money, $1 transaction)

- [ ] Create a one-off $1 Payment Link in LIVE mode with the new redirect + metadata
- [ ] Apply a 100% discount code, complete the checkout
- [ ] Land on `/intake`, confirm name/email/phone prefill
- [ ] Submit form with a real photo
- [ ] In Payload admin: Job created with correct `stripe_*` fields, `payment_methods[]` row, `shipping_address`, `job_type`, `delivery_method`
- [ ] In Supabase Storage: photo present in `PP-PL` bucket
- [ ] In Stripe dashboard: Payment shows under the customer's record
- [ ] Refund the $1, archive the test Payment Link

---

## Post-launch checklist

### First hour

- [ ] Watch Vercel logs: `vercel logs --follow` while announcing the link
- [ ] First real intake → verify Job in admin, Client created, Media in S3
- [ ] If you see any `[stripe] getSessionPrefill error:` lines, pull the full message from Vercel dashboard logs (CLI truncates)

### First 24 hours

- [ ] Verify daily Supabase backup is enabled (Supabase dashboard → Database → Backups)
- [ ] Set up an error notification — at minimum Vercel's built-in deploy alerts; ideally a `console.error` → Slack/email hook
- [ ] Spot-check the WordPress side after rotating `wp-config` key — make sure shop transactions still work

### First week

- [ ] Address risks #6, #7, #8 from the register
- [ ] Implement Stripe webhook for `charge.refunded` and `payment_intent.payment_failed` (risk #9)
- [ ] Add the `kind` Media tagging to existing upload sites (intake, portfolio) — currently the field exists but isn't required, so most uploads won't be tagged

### Ongoing

- [ ] Weekly `./db-backup.sh` if Supabase auto-backups aren't sufficient retention
- [ ] Monitor Stripe → Payments for failed/disputed transactions
- [ ] Watch S3 bucket growth — if intake is popular, set a lifecycle policy or budget alert

---

## What's intentionally not on this list

- **Authentication for dashboards**: already in place via Payload sessions, redirects to `/admin/login` if no `req.user`.
- **HTTPS/TLS**: Vercel handles this automatically.
- **CDN/caching**: Vercel default for static, Next.js handles dynamic.
- **Migrations**: all 10 migrations under `src/migrations/` are registered in `index.ts`. No pending work.
- **Type generation**: clean per most recent `pnpm generate:types`. Re-run if you change any collection field before deploy.
