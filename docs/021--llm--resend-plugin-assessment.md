# 021 — LLM Assessment: `@chadcrume/payload-email-publishing` (Resend) assimilation

**Scope:** `021` — a companion document to the same request, not a new numbered doc.
**Requested by:** `docs/021--usr--eblast.md` ("create a new doc assessing assimilation, concerns, competing plugins or approaches and what new features my payload site will need")
**Date:** 2026-10-21
**Status:** assessment only. **Resend adoption is speculative and not committed.** Nothing in this doc should be built, installed, or migrated on the strength of it. Re-read the *Speculative status* section before acting.
**Decision recorded:** the 2026-10-21 chat produced a *directional preference* that Resend would eventually replace Brevo entirely. That is a lean, not a commitment, and it does not justify schema work today.

## For dummies

Resend is a company that delivers email. A friend wrote a plugin — a bolt-on for Payload, your admin system — that lets you write newsletters inside Payload and send them through Resend, including seeing who opened them.

Nothing here is being done. It is a "should we, and what would it cost" document. In four sentences:

1. The plugin fits your versions. It is young (version 0.0.4) and maintained by one person, which is a real but manageable risk.
2. It provides everything except the audience. You have to tell it which clients to email — and your client records currently cannot say "this person unsubscribed" or "this address is dead".
3. Installing it means changing the shape of your database (see `021--llm--db-migration-runbook.md` for what that involves), which is the risky part.
4. It would also replace Brevo. Today Brevo only sends you three internal admin alerts, so leaving it would be cheap.

**The one thing to remember:** Resend is speculative. This document is a map for a trip you have not decided to take.

## Speculative status

Everything here is contingent on a decision you have not made. Treat it as a map of the territory, not a plan of record.

What is **factual and useful regardless**:

- The 12 ranked concerns, especially the section-migration risk and `Email Sends` growth.
- The observation that Brevo today only sends 3 internal admin notifications, so the exit cost is low *if* you ever exit.
- The competing-approaches table, which is what you would consult at decision time.

What is **contingent** and should not drive work now:

- The staged path. Stage 0's port to Resend is only worth doing if the switch happens.
- `resolveRecipients`, the unsubscribe endpoint, webhook ingest, and the send guard. All are plugin-shaped work.
- Any schema change justified *only* by Resend webhooks. See the note on `marketing_status` below, which has an independent justification.

One correction to the analysis below: when this doc was written, `marketing_status` was justified by Resend's bounce and complaint webhooks. That was a weak reason, because those webhooks are speculative. The stronger reason is that **the Brevo CSV import you already run collects hard bounces and unsubscribes today** — it just writes them to `Organizations` instead of `Clients`. That justification is independent of Resend and stands on its own.

---

## Phase 1 — Step-Back Analysis

### Problem classification

Vendor integration + transactional-to-marketing channel migration inside a Payload app. Three intertwined problems:

1. **Recipient modeling** — who is email-able, and where that truth lives.
2. **Delivery instrumentation** — how bounces, unsubscribes, opens, and clicks flow back into the CRM.
3. **Schema and operational surface** — new collections, migrations, cron, webhooks on a live Postgres database.

### Governing principles

1. **One source of truth per fact.** The plugin stores *sends*, not *subscribers*. Subscriber truth must stay in `Clients`; duplicating it inside the plugin's own collections would create a second, drifting list.
2. **Reversibility before schema.** Any plugin adding collections to a live Postgres database is a one-way-ish door. Backup and a migration checkpoint come before install, not after.
3. **Webhooks replace CSV re-import.** Today's feedback loop is manual (export from Brevo, paste into the org-import screen). Resend's signed webhooks can make it automatic and current — this is the single biggest *upside* of the migration and should be treated as a goal, not a side effect.
4. **Least machinery.** A pre-1.0, single-maintainer plugin is a dependency risk. Only adopt the parts whose cost of replacement is low, and keep the send path behind our own module so the vendor is swappable.

### Data structures & complexity

- `Email Sends` = one row per (email × recipient). Growth is `O(campaigns × list size)`: at 2 000 clients and a weekly send that is ~104 000 rows/year. Comfortable for Postgres, but requires an index on `(email, createdAt)` and a retention policy; otherwise list views degrade and backups bloat.
- Webhook ingest is `O(1)` per event with an idempotent upsert keyed on Resend's event/message id. Without an idempotency key, retries double-count opens. This is the one place where a small design decision prevents a permanent data-quality problem.
- Recipient resolution at hand-off is `O(recipients)` and must be **stable and deterministic** (sorted by email), so a re-sent campaign to the same segment produces the same recipient set minus new unsubscribes.

---

## What the plugin actually is

Registry facts (v0.0.4, MIT):

| Fact | Value |
| --- | --- |
| Version | `0.0.4` — pre-1.0 |
| Author / maintainers | single (`chadcrume`) — your friend |
| Peer deps | `payload ^3.0.0`, `next ^15 \|\| ^16`, `react ^19`, `@payloadcms/ui ^3`, `@payloadcms/richtext-lexical ^3` |
| Declared deps | `svix ^2.5.0` only — **`resend` is not declared**, verify at install |
| Repo | `github.com/chadcrume/payload-email-publishing-plugin` |

Compatibility with pp-crm: Payload **3.72.0** satisfies `^3.0.0`; Next **15.4.10** satisfies `^15`. So peer deps pass — no version fight expected. The missing `resend` dependency is the one thing to check (`pnpm why resend` / read its `import` statements) because an undeclared runtime import breaks on a clean install.

### What it registers

- Collections: **Posts** (newsletter content), **Emails** (a send built from selected Posts), **Scheduler Items** (when it goes out), **Email Sends** (per-recipient delivery log).
- Endpoints: `GET /api/email-publishing/render-preview`, `GET /api/email-publishing/email-stats/:emailId`, `POST /api/email-publishing/resend-webhook` (Svix signature), `GET /api/email-publishing/trigger-sweep` (bearer `CRON_SECRET`).
- A scheduled sweep that hands off due emails, driven by a Payload job — needs a cron caller (`GET /api/payload-jobs/run` + `CRON_SECRET`).
- Admin components: live HTML preview field, scheduler summary field, delivery/open/click stats field.
- **Admin nav restriction** (`restrictAdminNavToPlugin`) — the README's own example registers it last so it can see all other collections.

### What it deliberately does not do

> "Look up your own subscriber/recipient model here. The plugin has no opinion on how recipients are stored."

`resolveRecipients` is **required**. This is the single most important fact for pp-crm: the plugin supplies authoring, scheduling, sending, and tracking, but not the audience. `Clients` is the audience — with the caveat that `Clients` currently has no unsubscribe/bounce state (see gaps).

---

## Assimilation concerns

Ranked by how much damage each does if ignored.

| # | Concern | Severity | Notes / mitigation |
| --- | --- | --- | --- |
| 1 | **New collections need a Postgres migration; 21 already exist** | High | `pnpm payload migrate:create` before deploy, never `push`. Full DB backup first. This is the highest-risk step in the whole migration and it is irreversible-ish. |
| 2 | **No suppression model on `Clients`** | High | Only `marketing_consent: boolean`. No `unsubscribed_at`, no bounce state. Feeding this to `resolveRecipients` will happily email someone who unsubscribed last month. Must add `marketing_status` before Resend goes live for real sends. |
| 3 | **`svix` but no `resend` dependency declared** | Medium | Verify before install; may need explicit `pnpm add resend`. Also means the plugin's send path may assume a global/optional import — read the dist before trusting it in production. |
| 4 | **Pre-1.0, single maintainer, 0.0.4** | Medium | Friend-authored is fine for a first integration but pin the exact version, and keep the send call behind our own module so a fork or replacement is a one-file change. Do not spread plugin imports across app code. |
| 5 | **Scheduling requires cron + `CRON_SECRET`** | Medium | On Vercel, Hobby plans only allow daily crons. If you need hourly sweeps you need Pro. Also: the sweep only runs if cron calls `/api/payload-jobs/run`; a silent cron failure means emails silently never send. Add a heartbeat/log and a "sweep ran" indicator. |
| 6 | **Admin nav restriction** | Medium | The team works in `/dashboard`, but this plugin's authoring UI lives in `/admin` and may take over the admin nav. Two UIs for one job. Decide deliberately: accept the split (simplest) or add dashboard links into the plugin views. |
| 7 | **`Email Sends` growth** | Medium | Per-recipient log. Needs index + retention (e.g. prune > 12 months) or the admin list and DB backups degrade. |
| 8 | **Webhook idempotency** | Medium | Resend retries. Upsert on event id, or opens/clicks double-count forever. |
| 9 | **Two ESPs on one domain during transition** | Medium | Resend needs a verified domain; Brevo currently sends admin mail from the same domain. SPF must include both senders in one record (10-lookup limit — fine with 2), and DKIM uses distinct selectors so both can coexist. Do not cut Brevo off before Resend's domain verification clears. |
| 10 | **Losing the Brevo CSV import** | Low–Medium | The org-import screen (`/dashboard/brevo-org-import`) becomes dead weight. Its replacement (webhooks → `Organizations`) is *better* but is real work. Keep it until the webhook path is proven. |
| 11 | **Rich text rendering fidelity** | Low | Default `renderPostContentToHtml` is a minimal serializer. Visual parity with the site needs our own renderer passed in. Cosmetic, easy to defer. |
| 12 | **Deliverability reputation starts at zero** | Low | New sending IP/domain warms up. Do the first send to a small segment, not the full list. |

---

## Competing approaches

| Approach | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **A. This plugin** | Authoring + scheduling + tracking + preview already built; MIT; friend who will fix bugs; matches our stack exactly | Pre-1.0; adds 4 collections; admin UI only; needs cron + webhook plumbing | **Recommended** — the authoring/tracking surface is the expensive part and it is free here |
| **B. Direct `resend` SDK + our own collections** | Full control; no plugin surface; ~200-300 lines | We rebuild authoring, preview, scheduling, delivery log, stats UI — realistically weeks | Only if the plugin breaks badly |
| **C. Brevo campaigns API (stay single-vendor)** | One ESP, no migration, existing org feedback loop keeps working | Brevo's campaign authoring is web-UI-centric; API-driven templating is clunky; you still own the audience model; and you asked for Resend | Rejected by your decision |
| **D. Hybrid: Resend newsletters + Brevo transactional** | Lowest blast radius | Two vendors, two deliverability reputations, two webhook systems, two sets of docs forever | Rejected by your decision (and unnecessary: Brevo only sends 3 internal notifications today) |
| **E. Other Payload newsletter plugins** | Possible mature alternatives | Not evaluated; they would need the same `resolveRecipients`-equivalent plus migration work, and you lose the friend-support advantage | Only revisit if A fails |

**Why A over B is the real decision:** the plugin's value is not the Resend call — that is ~20 lines. It is the compose/preview/schedule/stats workflow plus per-recipient logging. That is the part you would otherwise build and maintain.

---

## What the site needs — new features

### Shared foundation (required by both goals below)

1. **`Clients.marketing_status`** (`never_asked | subscribed | unsubscribed | bounced | complained`) + `marketing_status_changed_at`. Justified by the Brevo import you already run, not by Resend. Without this, every send is a guess.
2. **`resolveRecipients` against `Clients`** — filter `marketing_status = subscribed`, deterministic order, and (recommended) exclude `Organizations.status = declined` emails so the two contact populations cannot contradict each other.
3. **Webhook → CRM write-back** — map Resend `delivered / opened / clicked / bounced / complained / unsubscribed` onto `Clients.marketing_status` and onto `Organizations.status`/`responseNotes`, using the same status-rank logic that already exists in `brevo-org-import/route.ts` (`STATUS_RANK`, `deriveStatus`). That logic is worth extracting to `src/lib/outreach-status.ts` and reusing rather than duplicating.
4. **Send guard** — a server-side check that refuses to hand off any email whose recipient set was not resolved from `marketing_status = subscribed`. Prevents "export all clients" habits from leaking into real sends.

### Goal A — manually configured eblast

| Need | Have | Gap |
| --- | --- | --- |
| Author content | Lexical editor (present) | Newsletter-grade layouts; plugin registers Posts for this |
| Preview | — | Plugin's live preview field; check it renders our fonts/images |
| Choose audience | `Clients.tags[]`, consent flags | A saved-segment concept (tags are free-form strings; no saved queries) |
| Schedule send | — | Scheduler Items + cron + `CRON_SECRET` |
| Track results | Brevo CSV re-import | Plugin tracks; we must consume webhooks into the CRM |
| Unsubscribe link | — | **Missing and legally required.** Resend does not auto-inject unsubscribe for broadcasts; must be a real, signed endpoint that flips `marketing_status` |

### Goal B — criteria-driven auto-emails (e.g. a new sale)

| Need | Have | Gap |
| --- | --- | --- |
| Trigger on sale | Stripe fields on `Jobs` (`stripe_*`), POS route | No customer-facing send today; `docs/020*` is spec-only |
| Template with per-job data | Lexical | Needs parameterized templates (pet names, job status, tracking) — the plugin's Posts are campaign-shaped, not transactional-shaped |
| Transactional deliverability | — | Should use a **separate** Resend stream/domain split (transactional vs marketing) so a marketing complaint cannot hurt a receipt |
| Deduplication | — | Must not send the same "your order shipped" twice on webhook retry |
| Criteria model | — | Either hard-coded triggers in hooks, or a small `Automations` collection (trigger event + delay + template). Start hard-coded; a generic rules engine is premature |

**Important distinction:** marketing eblasts and transactional sale emails are different classes of mail with different consent rules. The plugin is built for the former. Using it for the latter will work mechanically but conceptually bends it — and a receipt must never be suppressible by `marketing_status`. Keep two paths even if both go through Resend.

---

## Recommended staged path

#### Stage 0 — no plugin, no risk (same week as the export work)
- Add `Clients.marketing_status` + `marketing_status_changed_at` (one migration) — contingent, but see the independent justification above.
- Port the three Brevo notification functions in `src/lib/email.ts` to Resend behind the *same* exported function names (`sendIntakeNotification`, `sendPosIntakeNotification`, `sendIntakeErrorAlert`). Callers in `src/app/api/intake/route.ts`, `src/app/api/intake/events/route.ts`, `src/app/api/stripe/pos/route.ts` do not change.
- Result: Brevo dependency gone, zero customer-facing risk, no plugin yet. Verify domain + SPF with both senders during the overlap.

#### Stage 1 — plugin, sending disabled
- `pnpm add @chadcrume/payload-email-publishing resend`, register with `disabled: true` so collections exist but no endpoints/jobs/nav changes.
- Generate and review the migration. Backup first. Deploy to a preview environment, not production.
- Confirm admin nav behaviour and that `Email Sends` schema indexes exist.

#### Stage 2 — one real campaign to a small segment
- Implement `resolveRecipients` + send guard + unsubscribe endpoint.
- Webhook ingest with idempotent upsert; verify opens/click counts by hand against Resend's dashboard for one send.
- Send to ~10 real consenting clients first, then a few hundred.

#### Stage 3 — automation
- Extract `deriveStatus`/`STATUS_RANK` to `src/lib/outreach-status.ts`; wire webhooks into `Organizations`.
- Retire `/dashboard/brevo-org-import` only after a webhook-driven week matches the CSV path's output.
- Then the sale-triggered auto-emails from `docs/020*`, as a separate transactional path.

#### Effort (rough)

| Stage | AI active | Your active |
| --- | --- | --- |
| 0 | 1-2 h | 30 min (Resend DNS + key) |
| 1 | 1-2 h | 30 min (backup + preview verify) |
| 2 | 3-5 h | 2 h (real send supervision) |
| 3 | 4-6 h | 1 h |
| Total | ~10-15 h | ~4 h |

---

## Open questions

1. Is the Resend domain `petportraits.ink`, and is admin notification mail allowed to share it with marketing mail? A subdomain (`mail.petportraits.ink`) for marketing is the safer split and costs one DNS record.
2. Vercel plan — Pro? The sweep frequency determines whether scheduling is "send at 9am" or "send within a day".
3. Do `Clients` and `Organizations` represent overlapping humans? If yes, `resolveRecipients` must dedupe across both or you will double-send; if no (clients = customers, orgs = prospects), the split is clean and simpler.
4. Is the plan to keep the admin panel as the eblast authoring home, accepting the `/admin` vs `/dashboard` split, or do you want dashboard entry points into the plugin views?

---

## Peer review

**Unreviewed.** `plan-review` returned `UNREVIEWED: OPENROUTER_API_KEY is not set`. No independent critique was obtained; the analysis above is mine alone. Say the word and I will re-run the single review round once the key is available.

---

## Summary

This assessment honors Phase 1 by keeping subscriber truth in `Clients` while letting the plugin own only send state, so no fact is stored twice and the vendor stays behind a swappable module boundary. It honors Phase 2 by sequencing the migration so that webhook idempotency, suppression state, and the Postgres backup all exist before a single real email is sent.
