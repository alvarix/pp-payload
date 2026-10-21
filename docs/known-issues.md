# Known Issues & Workarounds

## Payload CSRF origin rejection (2026-09)

### Symptom
Client-side `fetch` POSTs to `/api/dashboard/actions` returned 401 "Unauthorized",
while SSR page loads authenticated fine on the same session. Both single-card and
bulk status actions failed. The deployed site (portal.petportraits.ink) worked
normally throughout — the failure was local-only.

### Root cause
Payload's `extractJWT` cookie strategy rejects the `payload-token` cookie when the
request's `Origin` header is not in `config.csrf`:

```js
if (!origin || payload.config.csrf.length === 0 || payload.config.csrf.indexOf(origin) > -1) {
  return cookieToken;
}
return null; // silently dropped
```

`csrf` defaults to `[]`, and Payload appends `serverURL` only when it is
non-empty (`sanitize.js`: `if (config.serverURL !== '') config.csrf.push(config.serverURL)`).
An **empty** list is treated as "no restriction", because the guard short-circuits
on `csrf.length === 0`. That combination hid a misconfiguration for months: with
`SERVER_URL` never set on Vercel, production ran with CSRF effectively disabled.

Two asymmetries made this brutal to diagnose:

- **Navigation requests send no `Origin` header** → `!origin` passes → SSR auth worked.
- **`fetch` always sends `Origin`** → `http://localhost:3000` was not whitelisted → cookie silently discarded → `payload.auth` returned null → 401.

The JWT itself was always valid. Note also: Payload derives its signing key as
`sha256(config.secret).digest('hex').slice(0, 32)` (`dist/index.js`) — verifying a
token manually against the raw `config.secret` will always report "invalid signature"
and is a red herring.

### Fix

`csrf` and `cors` now share one `ALLOWED_ORIGINS` list in
`src/payload.config.ts`, built from `SERVER_URL`, `EXTRA_ORIGINS`, the production
origin, and localhost/127.0.0.1 on ports 3000-3002.

**The original fix caused a production outage.** Listing only
`process.env.SERVER_URL || ""` plus localhost entries converted an empty
(permissive) list into a non-empty (strict) one that did not contain the
production origin, because `SERVER_URL` was never set on Vercel. Client-side
writes broke on deploy while SSR was unaffected. Any edit to this list must keep
the production origin present, or auth will appear to work on page loads and fail
silently on every save.

### Process lesson
On "Unauthorized" / 401 errors, instrument the server side on round 1 — do not
theorize. A 401 merges four distinct failure modes into one signal: missing cookie,
expired token, wrong secret, missing user. Each wrong theory came with plausible
corroborating evidence (DevTools showed the cookie, the system clock really was
wrong, SSR pages masked the failure). The decisive technique was logging what the
server actually receives and verifying with Payload's own library (`jose`) and its
own derived key (`payload.secret`), not assumptions about how auth "should" work.

### Restart the dev server after touching `payload.config.ts`

Recurrence, 2026-10-21: the same 401 on card status changes came back and was
fixed by restarting `pnpm dev` with no code change at all.

Payload caches its initialised instance. Next.js hot-reloads pages, but a
long-running dev server keeps the `csrf`/`cors` arrays it read at startup. So a
config fix can be committed, pulled and visible in the file while the running
server still enforces the old list. Symptom is identical to the original bug:
SSR fine, client `fetch` 401s.

When auth behaves differently from the code you are reading, restart before you
investigate. On the deployed side the same applies for a different reason: Vercel
keeps serving the last **successful** build, so a failed deployment leaves the
previous config live.

## Environment quirks

- This machine's system clock can run ahead of real time (observed ~1 year off
  while NTP set to "auto"). JWT `exp` comparisons are clock-sensitive — check
  `date` on the server before trusting expiry-based theories.
- Browser cookie jars can carry unrelated third-party cookies (WordPress, GA)
  that muddy auth debugging but are not themselves the problem.