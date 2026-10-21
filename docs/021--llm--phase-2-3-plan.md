# 021 — LLM Plan: Phase 2 export config, Phase 3 Resend

**Scope:** `021` — a companion document to the same request, not a new numbered doc.
**Date:** 2026-10-21
**Status:** Phase 1 shipped and committed (`17f6eb7`). Phase 2 is a proposal. Phase 3 is a brief only — Resend adoption remains **speculative and uncommitted**.

---

## For dummies

Phase 1 is finished: there is a button that downloads a CSV of your clients, and every client is now mailable in the database.

Phase 2 makes that button adjustable — choose which columns you get and which clients are included. There is no language model anywhere in this plan; an earlier draft of this document wrongly included one, and that section has been removed.

Phase 3 is about sending the email ourselves through Resend instead of Brevo. It is written up, not decided. Nothing should be built for it yet.

Condensed version:

| Phase | State | Blocking question |
| --- | --- | --- |
| 1 — fixed export button | **shipped**, migration applied, 232 mailable | none |
| 2 — configurable export | proposal, no code | how much UI do you want |
| 3 — Resend | brief, speculative | replace Brevo or coexist |

---

## Phase 1 — what actually shipped

| Component | Path | Notes |
| --- | --- | --- |
| Export endpoint | `src/app/api/dashboard/export/clients/route.ts` | auth-gated, paginated 200/page, caps at 10,000, `no-store` |
| CSV serializer | `src/lib/csv.ts` | RFC 4180, CRLF, no BOM, 21 tests |
| Send rule | `src/lib/marketing.ts` | `isSendable()` = consent true AND status subscribed, 12 tests |
| Schema | `clients.marketing_status`, `consent_basis`, `consent_recorded_at`, `marketing_status_changed_at` | migration applied, batch 12 |
| Hook | `Clients.beforeChange` | stamps status timestamp, revokes consent on suppression |
| UI | `DashboardNav` → **Export for Brevo** | plain anchor on Jobs and Orgs pages |
| Data | 232 clients, all `subscribed`, basis 2 `express` / 230 `existing_customer_us` | snapshot table `clients_consent_snapshot_20261021` |

Verified: 52/52 lib tests, `tsc` clean except a pre-existing `pg` types error, `next build` compiles.

Known debt carried into Phase 2:

1. `payload migrate` hangs. The migration was applied by running its SQL directly and inserting the bookkeeping row. Fix before the next schema change.
2. Production schema drifted from migration history once already (a column existed with no migration record). `migrate:status` is only trustworthy if nothing pushes schema outside migrations.
3. The export has no memory of prior sends — every export is a full snapshot.

---

## Phase 2 — configurable export

### 2.1 Configurable export

The route currently hardcodes eight columns. Replace the hardcoded array with a **column registry**: each entry declares a header, how to read the value, and the query parameter that enables it.

```text
src/lib/export-columns.ts
  { key: "email",      header: "email",      value: c => c.email,      group: "identity" }
  { key: "repeat",     header: "repeat_customer", value: row => csvBoolean(row.orders > 1), group: "segmentation", needs: "orders" }
  { key: "last_order", header: "last_order_date", value: row => csvDate(row.lastOrder),   group: "segmentation", needs: "orders" }
```

Parameters, all optional, all server-validated against the registry:

| Param | Meaning | Failure mode |
| --- | --- | --- |
| `include=<keys>` | comma-separated column keys, in registry order not request order | unknown key → 400 listing valid keys |
| `filter=sendable` | existing behaviour | unchanged |
| `since=YYYY-MM-DD` | only clients with a job on or after the date | bad date → 400 |
| `only=repeat\|new\|none` | derived from the job count already computed | unknown value → 400 |

Why the registry matters: it is the seam that makes any future UI cheap, and `include` is a whitelist, so a checkbox cannot invent a column or reach a field outside the declared list.

Add `last_order_date` and `order_count` while the aggregate query is already being run — they cost nothing extra and are the two most useful segmentation columns.

Acceptance criteria:

- Unknown `include` key returns 400 listing valid keys, not a silent drop.
- Column order is deterministic and independent of request order.
- `filter=sendable` and `include` compose correctly.
- Every registry entry has a unit test for its value function.
- `X-Total-Clients` / `X-Sendable-Clients` still report true totals, not filtered counts.

Effort: about 2 hours plus tests.

### 2.2 Optional second piece — the missing memory

Concern 7 in `docs/000--concern--where-the-data-lives.md`: nothing records who was sent what. A minimal fix is a `send_log` table written when an export is downloaded for Brevo, holding the date, the params, and the client ids. That turns "don't email these people twice" from a manual check into a query. Roughly 2 hours; worth doing before the next eblast, not before Phase 2 ships.

---

## Phase 3 — Resend, brief only

Full analysis: `docs/021--llm--resend-plugin-assessment.md`. Summary:

**Proposition.** Adopt `@chadcrume/payload-email-publishing` (v0.0.4, MIT) to author, schedule and send newsletters through Resend, with open and click tracking, and retire Brevo.

**Fitness.** Peer deps match: Payload `^3.0.0` against your 3.72, Next `^15` against 15.4.10. It registers four collections (Posts, Emails, Scheduler Items, Email Sends), needs `RESEND_API_KEY`, `RESEND_WEBHOOKS_SIGNING_SECRET` and `CRON_SECRET`, and requires a Vercel cron to run its sweep. Only dependency declared is `svix` — verify `resend` is installed explicitly.

**What it supplies and what it doesn't.** It supplies authoring, preview, scheduling, sending and per-recipient tracking. It does **not** supply an audience: `resolveRecipients` is required and the plugin has no opinion on where recipients live. Because Phase 1 exists, this is now small:

```ts
resolveRecipients: async ({ req }) => {
  const { docs } = await req.payload.find({
    collection: "clients",
    where: { marketing_status: { equals: "subscribed" } },
    user: req.user,
    overrideAccess: false,
    limit: 5000,
    sort: "email",
  });
  return docs.filter(isSendable).map((c) => ({ email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" ") }));
}
```

**Top five risks.** New collections require a migration on live Postgres (back up first — see `docs/021--llm--db-migration-runbook.md`); `Email Sends` grows one row per recipient per send and needs retention; the admin-only authoring UI splits from your `/dashboard` workflow; unsubscribe hosting and complaint feedback become your job; SPF must hold both senders during any overlap.

**Effort.** Roughly 10-15 hours across four stages, plus 4 hours of your time. Brevo currently sends only three internal admin notifications, so the transactional exit is cheap; the newsletter side is the real work.

**Decision needed before any code:** replace Brevo, or run both for one campaign cycle and compare deliverability. I would run both for one cycle.

---

## Open decisions

1. **Phase 2 UI**: a checkbox panel in the dashboard, or URL parameters only? The second is a fraction of the work and covers the same need.
2. **`send_log`**: build it before the next eblast, or accept manual bookkeeping one more time?
3. **Phase 3**: replace Brevo or coexist for one cycle?
4. **The `payload migrate` hang** — should that be fixed before Phase 2, so the next migration uses the supported path?
