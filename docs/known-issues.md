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

`csrf` defaults to `[serverURL]` — here `https://portal.petportraits.ink`. Two
asymmetries made this brutal to diagnose:

- **Navigation requests send no `Origin` header** → `!origin` passes → SSR auth worked.
- **`fetch` always sends `Origin`** → `http://localhost:3000` was not whitelisted → cookie silently discarded → `payload.auth` returned null → 401.

The JWT itself was always valid. Note also: Payload derives its signing key as
`sha256(config.secret).digest('hex').slice(0, 32)` (`dist/index.js`) — verifying a
token manually against the raw `config.secret` will always report "invalid signature"
and is a red herring.

### Fix
Whitelist local origins in `csrf` and `cors` in `src/payload.config.ts`:

```ts
csrf: [process.env.SERVER_URL || "", "http://localhost:3000", "http://localhost:3001"],
cors: [process.env.SERVER_URL || "", "http://localhost:3000", "http://localhost:3001"],
```

### Process lesson
On "Unauthorized" / 401 errors, instrument the server side on round 1 — do not
theorize. A 401 merges four distinct failure modes into one signal: missing cookie,
expired token, wrong secret, missing user. Each wrong theory came with plausible
corroborating evidence (DevTools showed the cookie, the system clock really was
wrong, SSR pages masked the failure). The decisive technique was logging what the
server actually receives and verifying with Payload's own library (`jose`) and its
own derived key (`payload.secret`), not assumptions about how auth "should" work.

## Environment quirks

- This machine's system clock can run ahead of real time (observed ~1 year off
  while NTP set to "auto"). JWT `exp` comparisons are clock-sensitive — check
  `date` on the server before trusting expiry-based theories.
- Browser cookie jars can carry unrelated third-party cookies (WordPress, GA)
  that muddy auth debugging but are not themselves the problem.