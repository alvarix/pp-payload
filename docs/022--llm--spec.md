# 022 — LLM Spec: Plug the Brevo export/import holes (no Resend)

**Scope:** `022` — new scope minted by Alvar in chat, 2026-10-21.
**Triggered by:** the `021` resend assessment discussion. Decision recorded there stands: **stay on Brevo, skip the Resend plugin.** But the discussion surfaced holes in the current manual export → Brevo web send → CSV import loop. This spec plugs them with minimal machinery.
**Status:** spec only. No code written. Peer review unavailable (see bottom).
**Correction to 021:** Alvar composes eblast HTML from scratch and does not use Brevo's builder. This weakens *both* authoring arguments in `021` — the plugin's editor is not needed, and Brevo's editor advantage never existed. The "stay on Brevo" decision now rests purely on avoiding migration/operational overhead, which is fine; it also means Brevo is swappable at any time because nothing valuable lives inside it.

## For dummies

Today you export clients to a CSV, upload to Brevo, hand-send the eblast, then bring the results CSV back into the CRM. The problem: that return trip only updates *prospects* (Organizations). It ignores *clients*.

In plain terms:

1. If a client unsubscribed in Brevo, the CRM never hears about it. Next export, they get included again. That is a legal risk (CAN-SPAM/GDPR) and a spam-complaint risk, and it is the most important fix in this doc.
2. The CRM has no idea when a client was last emailed. You cannot ask "who did I email recently?".
3. The CRM does not record opens, so you cannot tell engaged clients from lapsed ones.
4. There is a small existing bug: importing the same results CSV twice writes duplicate notes into org records. We fix that in passing.
5. Everything here uses the CSV you already download from Brevo. No new vendor, no API keys, no new subscriptions.

**The one thing to remember:** task 1 stops you from re-emailing people who opted out. Everything else is bookkeeping that makes segmentation nicer.

---

## Phase 1 — Step-Back Analysis

### Problem classification

Bi-directional data synchronisation between a system of record (CRM) and a stateless executor (Brevo), implemented over a manual CSV ferry. Sub-problems: **suppression propagation** (never re-email an opted-out address), **monotonic state transitions** (statuses may only move toward suppression via import), **idempotent batch upsert** (replaying the same CSV must be a no-op), and **enrichment** (carrying order data outward in the same CSV).

### Governing principles

1. **Single source of truth.** The CRM owns who may be emailed. Brevo executes sends but owns nothing. A fact discovered by Brevo (unsub, bounce) is a *report*, imported into the CRM — never stored as truth only in Brevo.
2. **Idempotency.** The CSV ferry is manual; the same file will be imported twice by accident. Every import must converge, not accumulate.
3. **Monotonic suppression.** An import may push a client toward suppression (`subscribed → unsubscribed/bounced`) but must never resurrect (`bounced → subscribed`) off the back of a delivered/opened row. Human action is the only path back.
4. **Least machinery.** Flat fields on `Clients`, not a per-send collection. At a few eblasts a year, per-recipient send logs are the `Email Sends` growth problem from `021` with none of Resend's payoff.

### Data structures & complexity

- Import is one pass over `n` CSV rows: parse → dedupe by email (existing `rowSignalStrength`) → **batch** lookup emails against `clients` and `organizations` with `where email in [...]` chunks (the current route does one `find` per row; with a chunked `in` query this becomes `O(n)` round trips → `O(n/chunk)`).
- Export stays `O(clients + jobs)` paginated, unchanged in shape; four new columns computed from data already loaded.
- New client fields are `O(1)` per client — no growth, no retention policy needed.

## Phase 2 — Edge Cases

1. **Email exists in both `Clients` and `Organizations`.** Both must be updated in the same import pass: client gets `marketing_status`, org gets outreach status. These are deliberately different states for the same human — the doc must say so explicitly so nobody "fixes" it later.
2. **Replayed CSV.** Second import of the same file must change nothing: notes are not re-appended (T3), `last_emailed_at` does not regress (T2 guard), suppressed statuses do not flip.
3. **Out-of-order campaign CSVs.** Importing last month's CSV after this month's must not regress `last_emailed_at` or `last_opened_at`. Guard: only apply metric updates when `Send_Date > last_emailed_at`.
4. **Case/format variance in `Email_ID`** (`Jane@X.com` vs `jane@x.com`). Postgres `email` is case-sensitive today; match on lowercased comparison. Decide: normalise stored emails or match case-insensitively — matching insensitively is the safe default; normalising stored emails is a separate cleanup, out of scope.
5. **CRM-suppressed client appears healthy in the CSV** (delivered, opened). Import must leave them suppressed — see monotonic principle. Their opens may still update `last_opened_at` for reporting, but status never moves backward.

## Phase 3 — Implementation Plan

### Architecture

Extract the reusable Brevo-CSV machinery into `src/lib/brevo-campaign.ts` (parser, dedupe, `brevoDateToISO`, `deriveStatus`, `STATUS_RANK`) and have the existing route consume it. The importer then runs **two adapters** over the same deduped rows: an org adapter (behaviour unchanged from today) and a new client adapter. One dashboard page, one route, no new UI beyond result-reporting lines. This is the adapter pattern applied to the importer so the CSV ferry stays one manual habit with two write-back targets.

### Tasks

#### T1 — Client write-back (critical)

- New client adapter in the import path, keyed on lowercased `Email_ID`.
  - `Unsubscribe_Date` present → `marketing_status: "unsubscribed"` (the existing `beforeChange` hook auto-revokes `marketing_consent` and sets `consent_basis: none`).
  - `Hard_Bounce_Date` present → `marketing_status: "bounced"` (only if not already more-suppressed).
  - `Complaint_Date` if Brevo exports it → `"complained"` (verify the column name against a real CSV; skip if absent).
  - Delivered/opened rows → no status change, ever.
- Emails not found in `clients` are reported in the result rows (action: `not a client`), **never created**. Org creation stays as-is.
- Suppression-only monotonicity enforced in the adapter: if current status is suppressed and the row is not a stronger suppression, skip.
- Existing-per-route auth (`payload.auth` + this is a dashboard admin route) unchanged; all reads/writes go through Local API with `overrideAccess: false` and the authenticated `user`.

#### T2 — Client email-metric fields

New fields on `Clients` (one migration; backup first, `pnpm payload migrate:create`, never `push`):

| Field | Type | Purpose |
| --- | --- | --- |
| `last_emailed_at` | date | newest `Send_Date` seen for this email |
| `email_sends_total` | number | count of campaigns the address received |
| `last_opened_at` | date | newest `Open_Date` |
| `email_opens_total` | number | lifetime opens, accumulated across campaign imports |

Importer rules: apply metric row only when `Send_Date > last_emailed_at` (guards replays and out-of-order CSVs); `email_opens_total` accumulates by adding the row's `Total Opens` on a *newer-than-last* campaign only. Expose on the admin UI with read-mostly descriptions noting the importer owns them.

#### T3 — Import idempotency

Append `responseNotes`/derived note only when not already present for that campaign: key the note on `Send_Date` (e.g. prefix `Eblast 2026-10-21:` and skip if that prefix already exists in the notes). Also covers re-import duplication flagged during research.

#### T4 — Enriched export columns (optional, cheap)

Add to `EXPORT_COLUMNS`: `orders` (already computed per client), `last_order_date` (new aggregation — needs the max non-inquiry job date per client; extend `countOrdersByClient` to also track latest date, rename to `summariseOrdersByClient`). Brevo will treat unmapped columns as contact attributes, making purchase-recency segmentation possible inside Brevo. Two columns, no new queries.

#### T5 — Reverse-sync procedure (no code beyond reporting)

After each import, the result summary lists emails that are suppressed in the CRM but present in the CSV — these exist in Brevo's list and must be removed/unsubscribed there by hand. Documented in README as part of the eblast ritual. Brevo API integration explicitly deferred; revisit if the manual step is missed even once.

### Test plan (vitest, `src/lib/__tests__`)

1. Parser/dedupe: unchanged behaviour preserved after extraction (regression tests around `rowSignalStrength`, `brevoDateToISO`).
2. Client adapter: unsub row → `unsubscribed` + consent revoked (via hook semantics, tested at unit level with `isSuppressed`); hard-bounce row → `bounced`; opened-only row → no change.
3. Monotonicity: suppressed client + healthy row → unchanged status.
4. Replay: import same CSV twice → identical DB state, no duplicate notes.
5. Out-of-order: older `Send_Date` does not regress `last_emailed_at`.
6. Dual-target: email in both collections updates both.
7. Export: new columns render; `sendable` filter excludes freshly-suppressed rows.

Run `tsc --noEmit` after each task; `pnpm payload generate:types` after T2.

### Effort (rough)

| Task | AI active | Alvar active |
| --- | --- | --- |
| T1 | 2-3 h | 30 min (review + test CSV) |
| T2 | 1-2 h | 15 min (backup + migrate) |
| T3 | 1 h | — |
| T4 | 1 h | 15 min (mapping check in Brevo) |
| T5 | 30 min | ongoing ritual |
| Total | ~5-7 h | ~1 h + a recurring 5-minute habit |

### Open questions for Alvar

1. Does Brevo's campaign export include a complaint/spam-report date column? (Need one real CSV to confirm; T1 adapts if so.)
2. `Complaint_Date` aside — is `email_sends_total` wanted, or is `last_emailed_at` alone enough? It is the one field with no obvious querying use at this volume.
3. For T4, should `pet_names` be exported as a personalization attribute? Trade-off: nicer greeting tokens vs. pet data living in Brevo's contact store.

---

## Peer review

**Unreviewed.** `plan-review` returned `UNREVIEWED: OPENROUTER_API_KEY is not set`. No independent critique obtained; the plan is mine alone. Re-run the single review round when the key is available.

---

## Summary

This spec honours Phase 1 by treating the CSV ferry as a synchronisation problem governed by idempotency and monotonic suppression, so the CRM stays the sole authority on who is emailable while Brevo stays a disposable executor. It honours Phase 2 by resolving the dual-population, replay, and out-of-order edge cases in the adapter design before any schema is touched, and by confining schema work to four flat `O(1)` fields.
