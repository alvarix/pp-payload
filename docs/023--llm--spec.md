# Doc 23 — LLM Spec — Stripe Capture Completeness

**Status:** Implementation complete — awaiting Alvar's test + approval
**Date:** 2026-11-22

---

## For dummies

Every time someone pays you through Stripe, a record should appear in the CRM. Before this pass, that only happened in two cases: the customer finished the website intake form, or a POS tap where an email was collected. Two kinds of payments silently produced nothing: (1) a POS tap where no email was entered (like a Tap-to-Pay sale with a typed-in custom amount), and (2) an online payment where the customer paid but never submitted the intake form.

Now three things happen:

1. A POS tap with no email still creates a record. The record links to one shared "walk-up" client called `pos-walkup@petportraits.ink` — no fake emails per sale.
2. Online payments get their own webhook. The moment Stripe says "paid", a stub record exists — even if the customer never touches the intake form.
3. If the customer later submits the intake form anyway, the form fills in the stub that already exists. No duplicate.

There is also a script that reads your whole Stripe history and prints every charge that has no CRM record. It can create those missing records when you tell it to.

To verify locally before deploying:

```bash
npx tsc --noEmit                 # type check
npx vitest run --config ./vitest.config.mts   # unit tests (no DB needed)
node --env-file=.env scripts/reconcile-stripe.mjs   # dry-run report vs live DB
```

---

## Incident

`pi_3UeJm9KsvaxLGOVJ2nHV3Ojl` — USD 163.31, Tap-to-Pay on the Stripe phone
app, key-in custom amount, no product chosen, **no email and no customer
attached**. Stripe delivered `payment_intent.succeeded` at 2:17:56 PM. The
POS webhook received it and deliberately skipped it: all three event paths
required an email, and none existed. The free-form amount was not the
cause — the missing email was.

## Root causes

| Cause | Effect |
| --- | --- |
| `extractPosPayment()` returned `null` when no email | Email-less card_present charges captured nothing |
| No `checkout.session.completed` handler | Online payments depended entirely on the customer submitting `/intake` |
| No reconciliation in `/api/intake` | A form submission after a webhook stub would have created a duplicate Job |

## Changes

| File | Change |
| --- | --- |
| `src/lib/stripe-capture.ts` (new) | Shared capture: `capturePaymentStub()`, `findJobByStripeIds()`, `extractCaptureFromSession()`, `resolveJobType()`, `resolveDeliveryMethod()`, `WALKUP_CLIENT_EMAIL` |
| `src/lib/stripe-pos.ts` | `PosPaymentData.email` is now `string \| null`; `extractPosPayment()` no longer skips email-less charges |
| `src/app/api/stripe/pos/route.ts` | `createPosRecord()` delegates dedupe/client/stub to `capturePaymentStub()`; walk-up fallback for `email === null` |
| `src/app/api/stripe/checkout/route.ts` (new) | `checkout.session.completed` (paid only) → stub Job, `source: website`, secret `STRIPE_CHECKOUT_WEBHOOK_SECRET` |
| `src/app/api/intake/route.ts` | Reconciliation: finds a Job by `stripe_payment_intent_id` / `stripe_checkout_session_id` and updates it instead of creating a second Job |
| `src/migrations/20261122_000000_unique_stripe_payment_intent.ts` (new) | Unique index on `jobs.stripe_payment_intent_id` — DB backstop for the webhook/form create race |
| `scripts/reconcile-stripe.mjs` (new) | Scans all Stripe succeeded charges, reports missing, `--backfill` creates them |
| `src/lib/__tests__/stripe-capture.test.ts` (new) | 9 unit tests: session extraction, job-type/delivery resolution, walk-up constant |
| `src/lib/__tests__/stripe-pos.test.ts` | Updated: email-less charge now returns data (email `null`), not `null` |

## Design decisions

1. **One shared walk-up client, not per-payment fake emails.** A fake email
   per sale (`unknown-pi_xxx@…`) would fragment the CRM into single-use,
   unmergeable clients. All email-less sales link to
   `pos-walkup@petportraits.ink`, which is forced to
   `marketing_consent: false`, `marketing_status: never_asked`,
   `consent_basis: none` — the placeholder can never receive marketing email.
2. **Separate checkout endpoint.** `/api/stripe/checkout` is its own route
   with its own signing secret, so a bug in online capture cannot break POS
   capture (and vice versa). Same shared lib underneath.
3. **Dedup, then unique index, then 23505 catch.** `capturePaymentStub()`
   checks by PI id / session id first (covers retries); the DB unique index
   catches the concurrent-create race; the catch re-fetches and reports
   `duplicate: true` so a webhook never 500s on the race.
4. **Fail-open stays.** Webhooks return 2xx for anything except a bad
   signature (400). A capture exception returns 500 so Stripe retries — safe
   because dedupe.
5. **No `charge.succeeded` handling.** `payment_intent.succeeded` /
   `checkout.session.completed` are sufficient; adding charge-level events
   would only invite double-counting.

## Backfill procedure (the missing $163.31 and any others)

```bash
# 1. dev server running, from repo root:
node --env-file=.env scripts/reconcile-stripe.mjs            # report only
node --env-file=.env scripts/reconcile-stripe.mjs --backfill # create missing
# 2. single PI:
node --env-file=.env scripts/reconcile-stripe.mjs --pi=pi_3UeJm9KsvaxLGOVJ2nHV3Ojl
node --env-file=.env scripts/reconcile-stripe.mjs --backfill --pi=pi_3UeJm9KsvaxLGOVJ2nHV3Ojl
```

`STRIPE_SINCE=<unix>` limits the scan to charges created after a timestamp.
The script requires `PAYLOAD_EMAIL` / `PAYLOAD_PASSWORD` for REST auth (in
`.env`). Backfilled Jobs carry the note
`[POS sale — backfilled by reconcile script]` (or Website payment) so they
are distinguishable from live-captured ones.

## Stripe dashboard + Vercel checklist (manual, Alvar)

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
   `https://portal.petportraits.ink/api/stripe/checkout`
   - Event: `checkout.session.completed`
   - Reveal signing secret → set `STRIPE_CHECKOUT_WEBHOOK_SECRET` in Vercel
     (Production + Preview).
2. Confirm the existing `/api/stripe/pos` endpoint's events still include
   `payment_intent.succeeded`, `customer.updated`, `invoice.updated`.
3. Deploy, then verify with the Stripe CLI:

```bash
stripe trigger checkout.session.completed   # expect delivery 200 in Stripe's log
```

The sample event is not a real paid sale, so it likely creates **no** Job —
the point is confirming the signature is accepted (200, not 400/500). Real
capture is proven by the next genuine payment or by the reconcile scan.

4. Apply the migration (direct DATABASE_URL, not the pooler):

```bash
./db-backups/db-backup.sh   # backup FIRST
psql "$DIRECT_DB_URL" -c "SELECT stripe_payment_intent_id, COUNT(*) FROM jobs \
  WHERE stripe_payment_intent_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;"  # must be 0 rows
pnpm payload migrate
```

If the duplicate check returns rows, stop — reconcile manually first; the
unique index will fail to build.

> Click-by-click versions of every step in this checklist live in
> [`docs/023--usr--spec.md`](023--usr--spec.md) — use that as the working
> checklist.
## Verification

- `tsc --noEmit` clean.
- `vitest`: 15/15 passing (`stripe-pos.test.ts` 6, `stripe-capture.test.ts` 9).
- Reconcile script dry run against live DB: to be run by Alvar (needs
  `PAYLOAD_*` credentials + Stripe key).
- E2E webhook test is manual (Stripe CLI trigger) — see checklist above.

## Confidence assessment — will this break anything?

**Degree of confidence: high.** This change is additive: no collection schema
fields changed (no `push` anyway — `push: false`), no dashboard or frontend
component touched, and every pre-existing code path keeps its previous
behavior for its previous inputs. The two behavior changes (email-less POS
capture, intake reconciliation) are the point of the pass, and both are
behind dedupe.

**Evidence.** `tsc --noEmit` clean. Full integration suite: **137/137 passing
across 13 files** (not just the new units), including `intake-route.int.spec.ts`,
which exercises the changed `/api/intake` paths (forged-field rejection,
server-side Stripe verification). Unit tests for the changed libs: 15/15.
The e2e suite was **not** run: it covers dashboard, frontend pages, and
`/api/intake/events` — none changed — and it boots a dev server against the
production-linked database. The changed webhook routes have no e2e
coverage by design; their smoke test is the Stripe CLI trigger in the
checklist.

### What this does NOT touch

| System | Status |
| --- | --- |
| Database schema (columns/tables) | Unchanged — migration adds an index only |
| Dashboard / frontend pages | Unchanged |
| `/api/intake` without a Stripe session | Byte-identical behavior (existingJob null → create, same data) |
| POS `customer.updated` / `invoice.updated` paths | Same logic, same fields, now through the shared dedupe |
| Emails | Unchanged except POS walk-up replyTo (open question 1) |
| Marketing export | Placeholder client is `never_asked` + `consent: false` + basis `none` — filtered out by `isSendable()` |

### Ranked failure points (most → least likely) and recovery

1. **Stripe/Vercel misconfiguration (manual steps 1–2).** The most likely
   failure, and the same class as June's incident: wrong secret value, wrong
   scope, typo'd URL → every delivery 400/500s. **Recovery:** Step 4's smoke
   test catches it the same day (400 = secret mismatch — redo step 2). For
   anything already lost: Stripe Dashboard → endpoint → deliveries →
   **Resend**, or run the reconcile script, which backfills from history.
   Nothing is permanently lost while Stripe retains the events.
2. **`pnpm payload migrate` hangs.** Known issue: the Payload CLI hung on the
   2026-10-21 migration (CHANGELOG §2026-10-21); SQL was executed manually and
   the `payload_migrations` row inserted. If it hangs again: kill it, run the
   migration's two statements (`CREATE UNIQUE INDEX …`; insert into
   `payload_migrations`) in one transaction in the Supabase SQL editor,
   following that documented precedent. **Impact if skipped:** only the race
   backstop is missing; code-level dedupe still holds for sequential events.
3. **Migration fails on pre-existing duplicates.** Postgres aborts the index
   build if two Jobs share a PI id. **Recovery:** the pre-check query in step 3
   surfaces them first; if rows appear, stop and tell the agent — merge/delete
   manually, rerun. App is unaffected either way (the index is additive).
4. **Email-less POS sales start appearing (intended behavior change).**
   Walk-up sales now create Jobs linked to one shared placeholder client.
   "Failure" would be operator confusion, not a break. **Recovery:** none
   needed; unwanted Jobs are deletable in admin (no cascade — placeholder
   client deletion is blocked only while linked Jobs exist).
5. **Intake reconciliation overwrites stub fields.** The update sets notes,
   pets, status, client — intended. One nuance: `payment_methods` is set to
   the form's single `website` entry, replacing a stub's `pos` entry in the
   rare cross-path (see 6) — same money, possibly wrong method label.
   **Recovery:** `payment_methods` is human-editable in admin.
6. **Online wallets may be labeled `source: pos`.** Apple Pay / Google Pay
   report `payment_method_details.type: card_present`, so a
   `payment_intent.succeeded` delivery to `/api/stripe/pos` creates a
   pos-labeled stub for an online wallet payment. The subsequent
   `checkout.session.completed` to `/api/stripe/checkout` dedupes — no
   double record, only a possible mislabel. **Recovery:** relabel `source`
   in admin if it matters; low frequency.
7. **Reconcile `--backfill` writes to the production DB.** Intended (real
   sales), but it also records charges later refunded (`paid=true` includes
   refunded). **Recovery:** dry-run default + manual review of the printed
   list before backfilling; unwanted Jobs are deletable; reruns are safe
   (deduped by PI).
8. **The 23505 catch misses.** If Payload wraps the unique-violation error
   so `code` isn't visible, `capturePaymentStub` rethrows → webhook 500 →
   Stripe retries → the retry's dedupe check finds the first record and
   returns `duplicate`. **Recovery:** automatic by convergence.

### Honest limits (unchanged by this pass)

- Refunds/disputes: stubs stay `stripe_payment_status: paid` — out of scope.
- No automated alerting if a webhook silently stops being delivered — the
  reconcile scan is the audit; open question 2 covers scheduling it.
- The `customer.updated` 120-second window is kept as-is: still the primary
  path for emailed taps; email-less taps now have the fallback they lacked.

## Out of scope

- Refund handling (`charge.refunded`) — stubs keep `stripe_payment_status: paid`.
- Merging a walk-up stub into a real client when the identity is discovered
  later (manual today: reassign the Job's `client` in admin).
- Automated alerting on reconcile diffs (the script is run on demand).