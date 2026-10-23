# 022 — USR Spec: Plug the Brevo export/import holes

**Scope:** `022` — see `022--llm--spec.md` for the full technical spec.
**Companion LLM doc:** `docs/022--llm--spec.md`
**Date minted:** 2026-10-21
**Status:** awaiting Alvar review. No code written.

## For dummies

You send eblasts from Brevo using contacts exported from the CRM, and the results come back as a CSV. Today the results only update prospect records — client records never learn that someone unsubscribed or bounced. This spec fixes that and adds a few useful remembered facts (when last emailed, opens). It stays with Brevo; no Resend, no new accounts.

## Task checklist

**T1 — Client write-back from Brevo results CSV (critical)**

- [ ] Emails in the results CSV match `clients` as well as `organizations`
- [ ] `Unsubscribe_Date` row sets client `marketing_status: unsubscribed` (consent auto-revoked by existing hook)
- [ ] `Hard_Bounce_Date` row sets client `marketing_status: bounced`
- [ ] Delivered/opened rows never change client status; suppressed clients never resurrected
- [ ] Unknown emails are reported, not created as clients

**T2 — Client email metrics**

- [ ] `last_emailed_at`, `email_sends_total`, `last_opened_at`, `email_opens_total` fields on `Clients`
- [ ] Migration created via `migrate:create` after DB backup
- [ ] Importer applies metrics only from campaigns newer than the stored `last_emailed_at`
- [ ] Types regenerated (`pnpm payload generate:types`)

**T3 — Import idempotency**

- [ ] Re-importing the same CSV adds no duplicate org notes
- [ ] Replay produces identical DB state (test proves it)

**T4 — Enriched export columns (optional)**

- [ ] Export adds `orders` and `last_order_date` columns
- [ ] Verified the columns land as Brevo contact attributes

**T5 — Reverse-sync procedure**

- [ ] Import summary lists CRM-suppressed emails that appear in the CSV
- [ ] README documents the post-import ritual: remove those addresses in Brevo

**Process**

- [ ] Tests written per the spec's test plan and passing
- [ ] `tsc --noEmit` clean
- [ ] Changelog entry added
- [ ] README eblast-ritual section updated
- [ ] Suggest commit(s) after Alvar tests

## USR feedback

(Alvar fills this in — anything wrong, missing, or over-built.)

- Alvar note, 2026-10-21: composing is done by hand in HTML; no Brevo builder reliance. Recorded in `022--llm--spec.md` header.
- Open questions needing answers before T2/T4 build: complaint-date column availability, whether `email_sends_total` is wanted, whether `pet_names` should be exported.