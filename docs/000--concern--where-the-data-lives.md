# 000 — Concern: where the data lives

**Series:** standing concerns, prefix `000--concern--`. Every doc in this series shares the number `000` and differs by slug — nothing increments, and the series never collides with the numbered spec series (`000`–`021`).
**Opened:** 2026-10-21 · **Review:** monthly, and after every eblast
**Status:** living document. Verified against the live database on 2026-10-21.

---

## For dummies

Your client list lives in two places. The CRM database is the real one. Brevo holds a copy so that Brevo can send the email.

Plain version:

1. Clients are created in the CRM — from intake, POS, or the admin panel.
2. Someone downloads a CSV of them and uploads it to Brevo.
3. Brevo sends the eblast.
4. Brevo learns who opened, who bounced, who unsubscribed.
5. That knowledge does not flow back automatically. Someone exports a CSV from Brevo and imports it into the dashboard — and that import writes to `organizations`, not to the `clients` rows the eblast was sent to.

So there are two copies, they drift, and the drift is invisible until a bounce lands somewhere nobody looks. Everything below is a consequence of step 5, plus the procedure for closing the loop by hand.

Condensed technical version:

| | |
| --- | --- |
| System of record | Supabase Postgres — `clients`, `organizations`, `jobs` |
| Outbound copy | Brevo contacts, written by manual CSV upload |
| Inbound signal | Brevo engagement CSV, parsed by `/api/dashboard/brevo-org-import` into `organizations` **only** |
| Consent stored in | `clients.marketing_consent` (boolean) and `clients.marketing_status` (enum — migration pending) |
| Suppression stored in | Brevo's blacklist, plus `organizations.status = declined` and free text in `organizations.response_notes` |
| Sync automation | none, in either direction |
| Current overlap | **0** client emails match any organization email |

---

## Standing concerns

| # | Concern | Why it bites | How to notice | Cadence |
| --- | --- | --- | --- | --- |
| 1 | **Two copies, no reconciliation** | CRM and Brevo drift whenever either side changes. Nothing compares them. | Counts and a sample of emails | monthly |
| 2 | **Suppression in Brevo, consent in CRM** | Someone unsubscribes in Brevo; the CRM still says consented; the next export re-sends them. | Emails unsubscribed in Brevo that are still sendable in the CRM | monthly |
| 3 | **The feedback loop lands on the wrong table** | The Brevo import writes to `organizations`; eblast recipients are `clients` rows. Different tables, never linked. Today the overlap is 0, so the loop currently reaches nobody. | Any `clients` row whose unsubscribe exists only in `organizations` | every eblast |
| 4 | **Consent was never captured — it is now asserted** | `grep -i consent src/app/api/intake` returns nothing, so no flow ever collected an opt-in. On 2026-10-21 all 232 clients were set to `marketing_consent = true` under `consent_basis = existing_customer_us`, as an operator decision. `consent_basis` now carries the difference between an express opt-in (2 rows) and a bulk assertion (230 rows). | `select consent_basis, count(*) from clients group by 1` | monthly |
| 5 | **One human, up to two records** | `clients.email` is unique; `organizations.email` is neither unique nor indexed (60 orgs, 13 with email). Currently 0 overlaps, so this is latent rather than active. | Emails present in both tables | before each eblast |
| 6 | **Erasure requests are a two-system job** | Deleting in the CRM leaves the Brevo contact; deleting in Brevo leaves the CRM row. | Any erasure request | per request |
| 7 | **The export is a snapshot with no memory** | Nothing records "who we last sent to". A second send in the same week re-mails everyone unless someone filters by hand. | Nothing detects it | per eblast |
| 8 | **Schema drifts outside migrations** | `clients.unsubscribed_at` and `clients_unsubscribed_at_idx` exist in production with no `payload_migrations` record, so `migrate:status` does not describe the database and `migrate:create` under-reports. | Column in DB, absent from `payload_migrations` | monthly |

### On concern 8 specifically

`push` is evidently off: after `marketing_status` entered the collection config, the column never appeared in the database despite `payload generate:types`, `tsc` and `next build` all booting the config. That points at a `pnpm dev` session rather than a CLI command — Payload's dev mode syncs schema to whatever `DATABASE_URL` points at, and `.env` points at production.

Either fix is sufficient:

- Point development at a separate database so a dev session cannot reach production.
- Set `push: false` on the postgres adapter so schema changes only happen through migrations.

---

## Re-importing unsubscribes, bounces and opens from Brevo

Current state of the loop, verified 2026-10-21:

| Fact | Value |
| --- | --- |
| Organizations | 60 (13 with an email) |
| `status = declined` | 1 (`maryjo@collierwest.com`) |
| Notes containing `Hard bounce` | 1 (`jacquelyn@joinfabrik.com`) |
| Notes containing `Unsubscribed` | 0 |
| Client emails matching an org email | **0** |

That last row is the important one: the two records carrying suppression signals have **no matching client**, so running the bridge today changes nothing. It will start mattering as soon as an eblast goes to actual clients and the engagement CSV comes back.

### Step 1 — Export the engagement CSV from Brevo

Brevo → **Contacts** → Export contacts → include engagement fields. The importer expects these columns, semicolon-delimited:

```text
Email_ID;Send_Date;Delivered_Date;Open_Date;Total Opens;Hard_Bounce_Date;Hard_Bounce_Reason;Unsubscribe_Date
```

### Step 2 — Dry run

Open `/dashboard/brevo-org-import`, paste the CSV, leave **dry run** on. Per row it reports `would create`, `would update → <status>`, `no change`, or `db duplicate — needs manual merge`.

What the importer decides, in priority order:

1. `Unsubscribe_Date` present → `status = declined`
2. `Hard_Bounce_Date` present → status unchanged, note records the bounce reason
3. `Total Opens > 0` → `opened_email`, unless the current status already ranks higher
4. `Delivered_Date` present → `contacted`, if that is an upgrade

It deduplicates by `Email_ID` first, keeping the row with the strongest signal, and flags rows where several orgs share one email rather than guessing.

### Step 3 — Apply

Turn dry run off. It writes to `organizations` only:

- `status`
- `contact_method = 'eblast'`
- `date_contacted` from `Send_Date` (only if empty)
- appends to `response_notes`: `Unsubscribed <date>` or `Hard bounce <date>: <reason>`
- creates a placeholder org (`name` = the email address) for any email it has never seen

### Step 4 — Bridge to `clients` (manual, until concern 3 is fixed)

The importer does not touch `clients`. Inspect first:

```bash
cd /Users/alvarsirlin/Sites/pp-crm
set -a; source .env; set +a

psql "$DATABASE_URL" -tAc "
  select c.email, o.status, left(coalesce(o.response_notes,''), 60)
  from clients c join organizations o on o.email = c.email
  where o.status = 'declined'
     or o.response_notes ilike '%Unsubscribed%'
     or o.response_notes ilike '%Hard bounce%';"
```

If that returns nothing, stop — there is nothing to bridge. Otherwise apply, in this order, so that an unsubscribe always wins over a bounce:

```sql
-- 1. Unsubscribes
UPDATE clients c
SET marketing_status = 'unsubscribed', marketing_status_changed_at = now()
FROM organizations o
WHERE c.email = o.email
  AND (o.status = 'declined' OR o.response_notes ILIKE '%Unsubscribed%')
  AND c.marketing_status <> 'unsubscribed';

-- 2. Hard bounces, never overriding an unsubscribe or complaint
UPDATE clients c
SET marketing_status = 'bounced', marketing_status_changed_at = now()
FROM organizations o
WHERE c.email = o.email
  AND o.response_notes ILIKE '%Hard bounce%'
  AND c.marketing_status NOT IN ('unsubscribed', 'complained');
```

Requires the `marketing_status` migration to have run. Before that, the column does not exist and these statements fail.

### Step 5 — Verify

```bash
psql "$DATABASE_URL" -tAc "select marketing_status, count(*) from clients group by 1 order by 1;"
```

Expected after bridging today: nothing changes, because overlap is 0. After a real eblast, expect the counts to move by the number of rows the join in Step 4 returned.

### Caveats

- Brevo keeps blacklisted addresses blacklisted on import. Its import screen also offers "create and update"; use **update existing only**, and do not reset unsubscribe status.
- The importer splits on `;` and does not handle a semicolon inside a quoted field. Business names with semicolons will corrupt that row.
- Running the import twice is safe for status but appends duplicate notes to `response_notes`. Notes accumulate rather than replace.

---

## If we send through Resend ourselves

The copy problem does not vanish; it inverts. Today Brevo absorbs deliverability, bounce classification, complaint feedback and unsubscribe hosting. Sending directly means owning all of it, and Step 4 above stops being a manual bridge and becomes an inbound webhook.

| New responsibility | What goes wrong without it |
| --- | --- |
| Suppression list ownership | Unsubscribed people keep receiving mail |
| A real unsubscribe endpoint | Brevo hosted this; Resend does not auto-inject it for broadcasts |
| Bounce and complaint webhooks | Bounces retried forever; complaints unnoticed until the domain is throttled |
| SPF, DKIM, DMARC | Mail lands in spam, or the domain gets spoofed |
| Sending warm-up | A first blast to the full list from a cold domain gets flagged |
| Per-recipient send log plus retention | No answer to "did they get it", and unbounded table growth |
| Webhook idempotency | Retries double-count opens and can double-send |
| Marketing vs transactional separation | A marketing complaint taints the domain that sends receipts |

Not resolved by the switch: concerns 4, 5, 6 and 8. Those are structural.

---

## Monthly check

```bash
cd /Users/alvarsirlin/Sites/pp-crm
set -a; source .env; set +a

psql "$DATABASE_URL" -tAc "select count(*) from clients;"                                  # 1
psql "$DATABASE_URL" -tAc "select count(*) from organizations;"                            # 1
psql "$DATABASE_URL" -tAc "select marketing_consent, count(*) from clients group by 1;"    # 2, 4
psql "$DATABASE_URL" -tAc "select marketing_status, count(*) from clients group by 1;" 2>/dev/null || echo "(migration not applied)"
psql "$DATABASE_URL" -tAc "select count(*) from clients c join organizations o on o.email = c.email;"  # 5
psql "$DATABASE_URL" -tAc "select name from payload_migrations order by created_at desc limit 3;"      # 8
```

Baseline on 2026-10-21 (after the consent migration): 232 clients, 60 organizations, `marketing_status` `subscribed` = 232, `consent_basis` `express` = 2 and `existing_customer_us` = 230, overlap 0, newest migration `20261021_000000_add_clients_marketing_status` batch 12.

Pre-migration values are preserved in `clients_consent_snapshot_20261021` (232 rows, 2 consented). Drop that table once you are satisfied the change should stand — until then it is the only record of the original state.

---

## Open decisions

1. **The bulk assertion is now live.** 230 clients are mailable on `existing_customer_us`, which is defensible under CAN-SPAM for US recipients and is not sufficient for EU/UK/Canada. There is still no `country` data on most clients, so the basis rests on your statement rather than a recorded fact. If any recipient turns out to be outside the US, their row is wrong.
2. **46 of the 232 have no job in the CRM** — no order, no recorded relationship. They carry the same basis as paying customers.
3. **Do `clients` and `organizations` ever represent the same person?** Currently 0 overlap, so either the answer is no, or the two populations genuinely do not intersect yet.
4. **Replace Brevo or coexist?** Coexistence doubles the suppression surfaces; replacement means owning the table above.
5. **Drop `clients_consent_snapshot_20261021` when ready.** It is the only remaining record of pre-assertion consent.
