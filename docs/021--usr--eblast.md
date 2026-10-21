#Brevo export

## today's eblast
I need to export my clients for brevo for an eblast.
first name, last name, email
### data 
can you suggest any further fields to be added for segmentation?


## export button
assess adding an export button to the dashboard. 
i assume it should be configurable to some degree, but as a phase 1 perhaps a simple brevo shaped export, unless a customization screen is relatively easy. 

## prep for resend integration
im looking to install my friend's resend payload plugin.
https://www.npmjs.com/package/@chadcrume/payload-email-publishing
create a new doc assessing assimilation, concerns, competing plugins or approaches and what new features my payload site will need to a. manually configure an eblast b. set criteria for auto-emails like a new sale

---

## Tasks (proposed in `021--llm--eblast.md`, `021--llm--resend-plugin-assessment.md`, `021--llm--db-migration-runbook.md`)

### Part A — Brevo export button

- [x] Add `src/lib/csv.ts` with RFC 4180 `toCsv` / `escapeCsvField`
- [x] Add `src/app/api/dashboard/export/clients/route.ts` (auth, paginated, `no-store`)
- [x] Add `exportHref` prop + **Export for Brevo** link to `DashboardNav`
- [x] Wire the link from `/dashboard` and `/dashboard/organizations`
- [x] Unit tests: `tests/int/lib/csv.int.spec.ts` (17 passing)
- [x] Add `clients.marketing_status` + `marketing_status_changed_at` + migration (option B)
- [x] Export columns: `consent_given`, `marketing_status`, `marketing_status_changed_at`, `repeat_customer`
- [x] Update changelog
- [ ] Run the migration against the database (`pnpm payload migrate`)
- [ ] Manual: dev server, click, verify CSV in Brevo import screen
- [ ] Backfill `marketing_status` from existing Brevo unsubscribe/bounce rows on `Organizations`

### Part B — Resend (CONDITIONAL: the switch is speculative, not committed)

> Do not start these until the Resend decision is actually made. They are recorded for completeness only.

- [ ] Decide whether to switch to Resend at all (nothing below is approved)

- [ ] Stage 0: add `Clients.marketing_status` + `unsubscribed_at`
- [ ] Stage 0: port 3 Brevo notification fns to Resend behind existing names
- [ ] Stage 1: install plugin `disabled: true`, review migration, DB backup first
- [ ] Stage 1: verify domain, SPF/DKIM coexistence during overlap
- [ ] Stage 2: `resolveRecipients` + send guard + unsubscribe endpoint
- [ ] Stage 2: webhook ingest with idempotent upsert
- [ ] Stage 2: real send to ~10 clients, then a few hundred
- [ ] Stage 3: extract `deriveStatus`/`STATUS_RANK` to `src/lib/outreach-status.ts`
- [ ] Stage 3: retire `/dashboard/brevo-org-import` after webhook parity
- [ ] Stage 3: sale-triggered auto-emails (from `docs/020*`)

### Questions to answer before implementation

- [ ] Export also on Orgs page, or Clients only?
- [ ] Internal/test addresses to exclude?
- [ ] Resend domain split (marketing subdomain vs apex)?
- [ ] Vercel plan (determines sweep frequency)?
- [ ] Do `Clients` and `Organizations` overlap (double-send risk)?
