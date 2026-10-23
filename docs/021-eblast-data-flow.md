# 021 — Eblast data flow: export to CSV, suppression return path, and incremental export

**Scope:** `021` — sibling document in the existing eblast scope (descriptor form, not a new number).
**Related:** `021--llm--resend-plugin-assessment.md` (why we are not adopting Resend), `022--llm--spec.md` (the build spec for plugging these holes).
**Date:** 2026-10-21
**Status:** analysis only. No code changed.

## API sync: promising direction, with one important safety boundary

A Brevo API sync could keep the current workflow's useful parts: Alvar continues to write eblast HTML by hand and sends through Brevo, while the CRM updates the contact audience without a downloaded CSV, upload, or manual column mapping. This is an audience-management integration, not a replacement for Brevo's campaign authoring or sending tools.

### Recommended shape to investigate

Use a dedicated Brevo list whose meaning is exactly **"CRM clients currently eligible for marketing."** Before a campaign, an authenticated dashboard action would:

1. Read clients for which `isSendable(client)` is true (`marketing_consent === true` and `marketing_status === "subscribed"`).
2. Add or update those contacts and only the approved attributes needed for targeting (for example, name, order count, and last order date).
3. Reconcile that dedicated list so clients no longer eligible are removed from the CRM-managed marketing audience.
4. Show a dry-run/summary of additions, updates, removals, and failures before the user sends.

The campaign must target that managed list, not a mix of unmanaged lists. A full reconcile of ~230 clients is small; the case for doing this is safer, more repeatable audience management, not speed.

### Do not equate marketing opt-out with global blacklist

Do **not** assume that setting Brevo's global `emailBlacklisted` state is the right way to reflect a marketing-only unsubscribe. A global block may also affect transactional email if Brevo is used for that purpose. Prefer reconciling membership in a dedicated marketing list, while preserving Brevo's own unsubscribe/blacklist state. A hard bounce or abuse complaint can require a broader suppression, but that decision should follow verified Brevo semantics rather than a blanket mapping from CRM status.

The exact API operations for bulk upsert, removing contacts from one list, and preserving provider-side suppression have **not been verified**. Prototype with a dedicated test list and test contacts before implementation. Never run the first reconciliation against the live campaign list.

### Limits of a one-way sync

CRM → Brevo sync does not bring opens, bounces, or Brevo-originated unsubscribes back into the CRM. Keep importing the campaign-results CSV (once the client write-back described in `022--llm--spec.md` exists), or later add a separate webhook/API read-back path. Likewise, sending `marketing_status` as a contact attribute does not itself suppress anyone; list membership or a verified Brevo suppression operation does that.

Keep the API key server-side, require dashboard authorization, and start with a user-triggered pre-campaign sync rather than cron or sync-on-every-client-edit. Do not clear a Brevo unsubscribe automatically because a later CRM export says `subscribed`; resubscription needs an explicit, auditable consent action.

**Recommendation:** investigate this before incremental CSV export. Incremental files still require choosing between a full audience and a delta, whereas API reconciliation can keep the whole managed audience current. At this scale, build it only if it removes a real workflow or suppression risk—not as a performance optimization.

## For dummies

You export clients to a CSV, upload to Brevo, send the eblast, then import Brevo's results CSV back in. Three questions, answered plainly:

1. **Do you need to re-import to learn about unsubscribes and bounces?** Yes. The export is built *from* the CRM database. If a fact is not in the CRM, exporting again cannot produce it. Only the import direction carries new information.
2. **Can you just re-export and let Brevo keep its own unsubscribe state?** Re-exporting changes nothing in the CRM, so the CRM stays wrong. Whether re-uploading preserves Brevo's suppression state has not been verified here. Treat it as unknown until tested; off-platform opt-outs are not known to Brevo either way.
3. **Is an incremental "only new clients since last export" worth building at 230 clients?** No. Not at 230, and not really at 5,000 either — because a campaign needs the *whole* eligible audience, not the delta. Incremental exports only pay off if the import side becomes slow, and the better answer at that point is a one-click Brevo API sync, not a delta file.

**The one thing to remember:** the export cannot discover anything. It is a printout. Only the import teaches the CRM something new.

---

## Current workflow, as implemented

### Export (CRM → CSV)

- **Endpoint:** `GET /api/dashboard/export/clients`
- **Logic:** `src/lib/client-export.ts` (`loadClientExport`), shared with the page at `/dashboard/export/clients` so the page and the file cannot disagree.
- **Filters:**
  - default (`all`) — every client
  - `?filter=sendable` — `marketing_consent === true AND marketing_status === 'subscribed'` (`isSendable` in `src/lib/marketing.ts`)
- **Columns:** `email, firstname, lastname, consent_given, consent_basis, marketing_status, marketing_status_changed_at, repeat_customer`
- **Limits:** 200 rows/page, hard ceiling `MAX_PAGES = 50` → **10,000 clients**. Above that the route throws by design.
- **Format:** UTF-8 (no BOM), CRLF, RFC 4180 quoting, sorted by `email` ascending, case-sensitive (Postgres default).
- **Filename:** `clients-brevo-YYYY-MM-DD.csv`
- **Record of the export:** none. Nothing is written when an export happens. "Clients since the last export" is therefore not currently answerable by the system, by anyone.

### Send (Brevo, manual, outside the CRM)

1. Upload the CSV to Brevo, map columns to contact attributes.
2. Pick the list/segment, compose, send.
3. Brevo holds its own per-contact state: subscribed / unsubscribed / blocklisted, plus hard-bounce flags.

### Import (Brevo results CSV → CRM)

- **Endpoint:** `POST /api/dashboard/brevo-org-import`, page `/dashboard/brevo-org-import`, with a dry-run preview.
- **Reads columns:** `Email_ID, Send_Date, Delivered_Date, Open_Date, Total Opens, Hard_Bounce_Date, Hard_Bounce_Reason, Unsubscribe_Date`.
- **Writes to:** `organizations` **only**.
  - unsubscribe → org status `declined` + note
  - hard bounce → note only (status unchanged)
  - opened → org status `opened_email` (rank-based upgrade)
  - delivered → org status `contacted` (rank-based upgrade)
  - unknown email → a new org is created with the email as placeholder name
- **Does not touch `clients`.** A client who unsubscribed or hard-bounced in Brevo keeps `marketing_status: subscribed` in the CRM indefinitely.
- **Not idempotent:** `responseNotes` is appended on every run, so re-importing the same CSV duplicates notes.
- **Matching:** exact, case-sensitive `email equals` per row, one `find` per row.

### Diagram

```text
   CRM (Postgres)                            Brevo
   ─────────────                             ─────
   Clients ──export──▶ clients-*.csv ──upload──▶ contacts (attributes)
                                                  │
                                                  ├─ its own unsub/blacklist state
                                                  └─ campaign runs, results CSV
                                                        │
   Clients ◀── nothing ──────────────────────────────────┤
   Organizations ◀── import ── brevo-campaign-*.csv ◀─────┘
```

The dotted line that does not exist is the whole problem: results return to prospects, never to clients.

---

## Question 1: do unsubscribes and bounces require a re-import?

**Yes, for the CRM.** The import direction is the only one carrying information the CRM did not already have. No amount of re-exporting can synthesise it, because the export is a pure function of CRM state.

What "re-import" means precisely: bring the *results* CSV back through `/dashboard/brevo-org-import` (and, per `022`, its new client adapter). Not "upload the client list to Brevo again".

Why it matters even while Brevo is doing the sending:

| Scenario | Brevo blocks the send? | CRM correct? | Risk if never imported |
| --- | --- | --- | --- |
| Unsubscribed inside a Brevo email | Yes — Brevo's own state | No | CRM counts and segments wrong; latent trap |
| Marked spam inside Brevo | Yes | No | Same |
| Hard bounce inside Brevo | Usually flagged; not guaranteed permanent | No | Repeated sends to dead addresses damage sender reputation; CRM has no signal |
| Asked you by phone/email/Facebook | **No** — Brevo never heard it | Only if set manually | You email someone who opted out. This is the actual legal exposure |
| You leave Brevo eventually | — | No | Every Brevo-only suppression is lost |

So the current setup is *accidentally* safe for the common case (unsubscribe links live in Brevo, so Brevo already knows) and unsafe for the two cases that matter most: off-platform opt-outs and any future provider change.

## Question 2: can re-exporting alone work, letting Brevo keep its own status?

No — and the reason is structural, not a matter of configuration.

- Brevo's unsubscribe/blacklist is **contact status**, not a normal attribute. The CRM's `marketing_status` column lands in Brevo as **attribute text**. Brevo does not read it as an instruction; a row saying `marketing_status=unsubscribed` is a label, not a suppression.
- Therefore the CSV cannot tell Brevo to suppress anyone, and it cannot tell the CRM that Brevo suppressed someone. It is inert metadata in both directions.
- Whether a re-upload preserves Brevo's unsubscribe/blacklist state is **unverified**. Test one unsubscribed test contact in a separate list and confirm the state before relying on it.
- `updateExistingContacts` behaviour (update vs ignore duplicates) is a Brevo import setting. If duplicates are set to "ignore", re-upload may stop refreshing attributes; verify the actual setting.

Net: re-exporting does not update CRM suppression state, and its effect on Brevo's state should not be assumed. **The CRM stays stale either way.** Only a results import or separate read-back can update it.

One concrete hazard in the current defaults: exporting with **no filter** includes suppressed clients. Uploading that may add or refresh ineligible contacts in Brevo, depending on import settings; the `marketing_status` attribute is not itself a suppression command. Use `?filter=sendable` to avoid including ineligible clients in a new campaign upload, but note that omission from a CSV does **not** remove a contact already in Brevo. A dedicated managed list/API reconciliation is the possible fix for that.

## Question 3: is an incremental export worth building?

### What "incremental" would even mean

Incremental export means: export only clients whose state changed since a stored watermark. That is a **delta**. The problem is that a campaign does not want a delta — it wants the entire eligible audience. Sending last month's eblast to only the new clients would be a different campaign.

Deltas are only useful for *attribute refresh* (name changes, order counts, a corrected status). That is a maintenance upload, not a send.

So the realistic design is not "delta instead of full" but "full file plus occasional delta file" — two files per campaign, two chances to upload the wrong one. More failure modes, not fewer.

### Cost curve of the current full export

Estimates, assuming ~1 job per client and one page = 200 rows:

| Clients | Queries per export | CSV size | Export time | Brevo import |
| --- | --- | --- | --- | --- |
| 230 (today) | ~4 | ~20 KB | < 1 s | seconds |
| 1,000 | ~12 | ~90 KB | ~1 s | seconds |
| 5,000 | ~52 | ~450 KB | ~3-5 s | ~30 s |
| 10,000 | ~102 | ~900 KB | ~5-10 s | ~1 min |
| 10,001+ | — | — | **throws at `MAX_PAGES`** | — |

The first real wall is the hard 10,000 ceiling, not speed. Everything below it is faster than the human steps around it (find the CSV, upload, map columns).

### Break-even reasoning

Incremental export stops being worth it when `cost(delta machinery) < cost(full export at current size) + risk(two-file workflow)`.

- Full export cost today: effectively zero.
- Delta machinery cost: a watermark field, a query branch, an export-log record, page UI, tests, plus a permanent "which file do I upload?" question. Order of 3-5 hours, forever.
- The crossover is not a client count; it is an **import-duration threshold**. Roughly when a full upload takes long enough that you notice (≈10k+ contacts, minutes rather than seconds), or when the two-file risk is clearly smaller than the time saved.

**Verdict: do not build it now, and probably not until the export hits its 10,000 ceiling.** At 230 clients it is machinery for a problem that does not exist.

### If it ever is built, what mechanism

Ordered by usefulness, best last:

1. **Export log only (cheapest).** A collection `Eblast Exports` recording `exported_at`, filter, row count, user. Answers "when did we last export, and what did we send?" No behaviour change. ~1 h. Worth doing *before* any delta work, because a watermark with no ledger cannot be audited.
2. **Watermark delta.** Store `last_exported_at` on the ledger, add `?since=<date>` filtering `marketing_status_changed_at >= since OR createdAt >= since`. Useful only for refresh uploads; adds the two-file hazard. ~3 h.
3. **One-click Brevo API sync (the promising option).** A dashboard action upserts eligible contacts and reconciles membership in a dedicated CRM-managed marketing list. Do not map every CRM unsubscribe to a global blacklist without verifying its effect on transactional mail. This removes CSV upload/mapping and can keep the full audience current, but it does **not** close the reverse-sync gap: campaign results still need a CSV import or a separate webhook/API read-back. Verify bulk-upsert and list-removal semantics in a test list before estimating implementation effort. **If it works as intended, it makes incremental export unnecessary.**

In other words: the scalable fix for "full export is getting heavy" is to stop exporting, not to export less.

---

## Concrete recommendations

1. **Use `filter=sendable`** for a campaign upload so the file excludes currently ineligible clients. This does not remove previously uploaded contacts from Brevo; manage that through verified list-reconciliation behavior.
2. **Import the results CSV after every campaign**, every time, even when the campaign looks quiet — the unsubs are in there.
3. **Do not assume Brevo's status-persistence on re-upload.** Test with an unsubscribed contact in a separate list before relying on it, and keep CRM status write-back as a separate requirement.
4. **Do not build incremental export now.** If the 10,000 ceiling approaches, do the API sync instead.
5. **Do not rely on the CRM's `marketing_status` reaching Brevo as anything but a label.** If Brevo must suppress, that has to be set in Brevo or via its API.
6. **Suppressions that originate off-platform must be entered in both places** until `022`'s T5 report exists: CRM for truth, Brevo so the next send skips them.

## Verify locally before relying on any of this

```bash
# 1. Confirm the export's own numbers, without opening Brevo
pnpm dev
# then, signed in to the dashboard, in another shell:
curl -s -D - -o /dev/null http://localhost:3000/api/dashboard/export/clients?filter=sendable \
  | grep -i -E 'x-(total-clients|sendable-clients|rows-exported)'

# 2. Check for case-variant duplicate emails, which Postgres `unique` does not catch
psql "$DATABASE_URL" -c "select lower(email) as e, count(*) from clients group by 1 having count(*) > 1;"

# 3. Check how stale the CRM is compared to reality
psql "$DATABASE_URL" -c "select marketing_status, count(*) from clients group by 1 order by 2 desc;"

# 4. Confirm the import only touches organizations (proves the hole, pre-022)
rg -n 'collection: "clients"' src/app/api/dashboard/brevo-org-import/route.ts || echo "confirmed: no client write-back"
```

Brevo-side check (manual, once): mark a test contact unsubscribed in Brevo, re-upload a CSV containing that email, then confirm in the Brevo contact list that the status is still unsubscribed.

## Open questions

1. Which Brevo plan is in use, and does it bill by contact count? If yes, keeping suppressed addresses out of the list (recommendation 1) has a direct cost benefit.
2. Does the current Brevo import use "update existing" or "ignore duplicates"? If ignore, attribute refresh has never actually worked.
3. Is there any off-platform unsubscribe history (emails, phone notes) that should be backfilled into `Clients.marketing_status` before the next campaign?
4. Client growth rate — needed to know how far away the 10,000 ceiling actually is.

## Summary

The export is a printout of CRM state and can never discover a suppression, so the import direction is mandatory for CRM truth; re-exporting is harmless but inert because Brevo acts on its own contact status, not on a mapped attribute. Incremental export is a delta mechanism aimed at a whole-audience problem, so it stays unbuilt until the 10,000 ceiling actually bites — at which point the correct move is an idempotent Brevo API sync, not a smaller CSV.
