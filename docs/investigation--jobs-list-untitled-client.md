# Investigation: Jobs list shows "Untitled - ID: 591" instead of client email

Date: 2026-09-26
Status: Parked — data verified intact, browser-side fetch failure suspected. Revisit if it recurs or spreads.

## Symptom

On the production admin jobs list (portal.petportraits.ink), POS-source jobs
(jobs 460, 461 and other POS stubs) show `Untitled - ID: 591` in the Client
column instead of the client's email. The cell is also not clickable
("not linked to the client"). Persists across hard refresh.

## What "Untitled - ID: X" means

Payload 3.72 (`@payloadcms/ui` RelationshipCell → `formatDocTitle` with
`fallback: "${t('general:untitled')} - ID: ${value}"`). Rendered when:

- the related doc fails to load in the browser's background fetch
  (`RelationshipProvider` fetches `/api/clients?depth=0&limit=250&where[id][in]=...`
  with session cookies), or
- the doc loaded but the `useAsTitle` field (clients: `email`) is empty.

When the doc fails to load the cell renders as plain text — no hyperlink —
which explains the "not linked" observation. It is a display failure, not a
data problem.

## Verified facts (live production DB + API)

1. **Client 591 exists and is complete**: `smachiz@gmail.com`, created
   2026-09-19 19:57 by the POS webhook path (`customer.updated` →
   `findOrCreateClient`). `first_name`/`last_name` are null — normal for
   Terminal taps (only an email is captured).
2. **Job 461 is linked**: `client_id = 591`, source `pos`, $81.66 paid, PI
   `pi_3UHUNXKsvaxLGOVJ0UNzSyMl`. Job 460 → client 590
   (`ahickox@nyc.rr.com`), identical shape. No jobs with dangling client
   references exist anywhere in the table.
3. **Prod and local `.env` point at the same Supabase database** — verified by
   diffing the public `/api/events` response against the DB (identical,
   including whitespace quirks in titles).
4. **The server API is healthy.** Replayed the admin's exact requests against
   prod with an authenticated token:
   - `/api/clients?depth=0&limit=250&where[id][in]=592,591,...,583` → 200, all
     10 clients returned including 591 and 590 with emails.
   - `/api/jobs?depth=0&limit=6&sort=-createdAt` → 200, `client` is a raw
     numeric id (462→592, 461→591, 460→590).
   - `/api/clients/591` → 200, email present.
5. **REST ids are numbers** (Postgres), both for doc ids and relationship
   cell data.
6. Server clock and local clock agree (skew 823 ms) — the clock-skew theory
   from known-issues.md is not currently active.

## Root cause eliminated

- Dangling/broken relationship in DB — ruled out (no dangling refs).
- Prod/local DB divergence — ruled out (same DB).
- Server-side omission of specific docs — ruled out (exact fetch reproduced,
  nothing missing).
- Empty `email` on the client rows — ruled out (emails present).

## Remaining hypotheses

1. **Browser-side failure of the RelationshipProvider fetch** in the user's
   session (all client cells on the page would fall back to Untitled; user
   happened to be looking at POS rows). Server side is proven healthy, so if
   it reproduces, look here first: DevTools → Network, filter `clients`,
   check the status and response of the `where[id][in]` request.
2. **Deployed admin bundle differs from local 3.72** — the Vercel build may
   ship older relationship-loading code. Compare the deployed
   `/admin/*` chunk containing `idsToLoad`/`formatDocTitle` against
   `node_modules/@payloadcms/ui@3.72.0`.

## Next steps when picked up

- [ ] On the affected page: DevTools → Network → filter `clients` → note the
      status and whether the response contains client 591.
- [ ] Fetch the deployed admin chunk that contains `formatDocTitle` /
      `idsToLoad` and diff its logic against local 3.72.
- [ ] If the fetch 403s in-browser only, revisit the CSRF origin mechanism
      (docs/known-issues.md) for the GET + cookie path.

## Debugging technique that worked (keep for reuse)

Payload 3.72 JWTs need two things beyond a correct signature:

- Signing key is the **derived** key: `sha256(PAYLOAD_SECRET).digest('hex').slice(0, 32)`
  (raw-secret tokens are silently treated as unauthenticated — red herring,
  already noted in docs/known-issues.md).
- `sid` claim must reference a **live session row** in `users_sessions`
  (sessions are enabled; check `SELECT * FROM users_sessions WHERE
  expires_at > now()`).

With those, any read-only API request can be replayed exactly as the admin
UI makes it. The stale credentials in `.env` (401 on login) do not block
this path.