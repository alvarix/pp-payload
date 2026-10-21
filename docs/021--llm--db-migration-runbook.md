# 021 — LLM Runbook: backing up and migrating the database

**Scope:** `021` — a companion document to the same request, not a new numbered doc.
**Date:** 2026-10-21
**Status:** verified against the live database (read-only checks only). Nothing has been executed.
**Applies to:** `20261021_000000_add_clients_marketing_status`

> Steps are numbered because the order is the safety mechanism, not a style choice.

---

## For dummies

You are changing the shape of the `clients` table in the live database, then deploying code that depends on the new shape. The order is: back up, change the database, check the change, test locally, deploy.

Plain version:

1. Copy the entire database into one file. Check the file is not empty.
2. Apply the pending migration. One command.
3. Ask the database directly whether the change is there. Read-only commands.
4. Run the tests and a production build on your machine.
5. Deploy.
6. Click the export button in production and confirm the file is correct.

If step 2 fails, stop. Never run anything containing `reset` or `fresh` — those delete every table.

Condensed technical version:

- `ALTER TABLE clients ADD COLUMN marketing_status enum NOT NULL DEFAULT 'never_asked'` plus `marketing_status_changed_at timestamptz`.
- Backfill from `marketing_consent` (true → `subscribed`, else `never_asked`), and from the orphaned `unsubscribed_at` column if it holds data.
- Drop `unsubscribed_at` and `clients_unsubscribed_at_idx`; add `clients_marketing_status_idx`.
- `DROP COLUMN` is the only destructive statement, and it runs after the data is carried over.
- Payload records the migration in `payload_migrations`. It does not run on Vercel build; it runs only when you invoke it.

### The commands you will actually type

```bash
cd /Users/alvarsirlin/Sites/pp-crm
set -a; source .env; set +a

# 1. Backup + prove it is real
TS=$(date +%Y%m%d_%H%M%S); OUT="$PWD/db-backups/backup_${TS}.sql"
pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" > "$OUT"
test -s "$OUT" && echo "OK $OUT $(du -h "$OUT" | cut -f1)" || echo "ABORT: empty backup"

# 2. Apply
pnpm payload migrate

# 3. Verify
psql "$DATABASE_URL" -c "select marketing_status, count(*) from clients group by 1 order by 1;"
psql "$DATABASE_URL" -c "select name from payload_migrations order by created_at desc limit 1;"
```

If the backup line prints `ABORT`, do not continue.

---

## Phase 1 — Step-Back Analysis

**Problem classification.** DDL plus a data backfill against a live production database that a running Vercel deployment reads and writes. Not revertible with `git revert`.

**Governing principles.**

1. **A backup you have not inspected is not a backup.** `db-backups/` already contains two 0-byte dumps (`backup_20260422_162400.sql`, `backup_20260422_163322.sql`) created eight minutes apart among valid 388KB–478KB dumps. The script that made them reported success.
2. **One-way doors get a checkpoint.** Backup and verification precede any DDL, regardless of how harmless the migration looks.
3. **Confirm the target before mutating.** `.env`'s `DATABASE_URL` is the production Supabase database. There is no local database.
4. **Carry data before dropping columns.** This migration drops a column, so the backfill runs first.

**Blast radius, measured rather than assumed.**

| Measure | Value |
| --- | --- |
| Database | Supabase Postgres **17.6**, `aws-1-us-east-1.pooler.supabase.com:5432` (session pooler) |
| `pg_dump` | **18.3** (newer than server — compatible) |
| Rows in `clients` | **232** |
| `marketing_consent = true` | **2** |
| `marketing_consent` not true | **230** |
| Rows with `unsubscribed_at` set | **0** |
| Applied migrations | **11**; exactly **1** pending (this one) |

Two findings from those measurements:

- **The database already has `unsubscribed_at` and `clients_unsubscribed_at_idx`, but no migration recorded creating them.** Schema was changed outside the migration history, so `payload_migrations` understates what exists. The migration therefore checks `information_schema` before touching that column, and carries any data across before dropping it. Today it holds zero rows, so the carry-over is a no-op.
- **Only 2 of 232 clients have marketing consent.** After the migration, expect `subscribed = 2`. That is a data problem for the eblast, not a code problem — the export is working correctly by returning almost nobody.

---

## Phase 2 — Hazards and Pattern

| # | Hazard | Consequence | Guard |
| --- | --- | --- | --- |
| 1 | **Silent empty backup** | Two 0-byte dumps already exist in `db-backups/` | `test -s` plus a `CREATE TABLE` grep, abort on failure |
| 2 | **Schema drift from migration history** | Confirmed 2026-10-21: a `pnpm dev` session against the production `DATABASE_URL` pushed schema, created `unsubscribed_at` without a migration record, and later dropped `clients_consent_snapshot_20261021` after a `DATA LOSS WARNING` prompt was answered `yes`. `migrate:status` is therefore not a description of the schema | Check `information_schema` directly (Step 6); treat `migrate:create` output as a partial diff; never answer a schema prompt — stop and read it |
| 3 | **Backup written to the wrong directory** | `db-backup.sh` writes relative to the current directory | Absolute `OUT` path |
| 4 | **Wrong database** | `.env` points at production | Step 0 prints host/port/db, never credentials |
| 5 | **`pg_dump` older than server** | Refusal or partial dump | Step 2 compares versions (18.3 vs 17.6 — fine today) |
| 6 | **Transaction pooler port 6543** | DDL can fail | Use 5432 session mode (current `DATABASE_URL` is 5432) |
| 7 | **Half-applied migration** | Column may or may not exist | Every statement is `IF NOT EXISTS` / idempotent; re-run is safe |
| 8 | **Destructive commands in reach** | `migrate:reset`, `migrate:fresh` drop everything | Command reference below, marked never-on-production |

**Pattern:** checkpoint → verify → apply → verify → local test → deploy → confirm. Each step states what you should *see*, so a silent no-op is caught immediately.

---

## Phase 3 — The steps

### Step 0 — Confirm the target

```bash
cd /Users/alvarsirlin/Sites/pp-crm
set -a; source .env; set +a
node -e 'const u=new URL(process.env.DATABASE_URL);console.log("host:",u.hostname,"port:",u.port,"db:",u.pathname)'
```

Expect `aws-1-us-east-1.pooler.supabase.com`, port `5432`, `/postgres`. Stop if the port is `6543`.

### Step 1 — See what is pending

```bash
pnpm payload migrate:status
```

Expect 11 applied and `20261021_000000_add_clients_marketing_status` as the only pending row. Stop if another migration is pending that you did not write.

### Step 2 — Check the dump tool

```bash
pg_dump --version
psql "$DATABASE_URL" -tAc "select current_setting('server_version');"
```

Expect `pg_dump` major ≥ server major. Today: 18.3 vs 17.6.

### Step 3 — Back up, and prove it is real

Do not use `db-backups/db-backup.sh` until it is fixed (see the closing note).

```bash
set -euo pipefail
cd /Users/alvarsirlin/Sites/pp-crm
set -a; source .env; set +a

TS=$(date +%Y%m%d_%H%M%S)
OUT="$PWD/db-backups/backup_${TS}.sql"

pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" > "$OUT"

test -s "$OUT" || { echo "ABORT: backup is empty"; rm -f "$OUT"; exit 1; }
grep -q "CREATE TABLE" "$OUT" || { echo "ABORT: no CREATE TABLE in dump"; exit 1; }

ls -lh "$OUT"
echo "tables: $(grep -c '^CREATE TABLE' "$OUT")  inserts: $(grep -c '^INSERT INTO' "$OUT")"
```

Expect a file comparable to the most recent valid dump (`backup_20260603_191549.sql`, 478KB) or larger. A much smaller file means missing data, not saved space.

Also open Supabase → Database → Backups and confirm the latest automatic backup timestamp.

### Step 4 — Rehearse the rollback (optional, needs Step 3 done)

There is no local Postgres on this machine (`tests/int/migrations/` fails with `ECONNREFUSED 127.0.0.1:5432`), so a restore rehearsal needs a second database.

The cheaper rehearsal is to exercise the migration in both directions on the real database, with the backup in hand:

```bash
pnpm payload migrate        # up
pnpm payload migrate:down   # back to the previous shape
pnpm payload migrate        # up again
```

This proves the `down` path works before you depend on it. It is optional; it takes seconds and touches nothing but this migration's own statements. Skip it and you are trusting a rollback you have never run.

### Step 5 — Apply

Before running this, confirm three things:

1. **No `pnpm dev` process is running.** A dev server pointed at the same database pushes schema independently and can drop tables while this migration runs.
2. **`push: false` is set** on the postgres adapter in `src/payload.config.ts`. Until it is, any dev run is an unreviewed schema migration.
3. **Any prompt stops the run.** If you see `Warnings detected during schema push`, do not answer it. Paste it and investigate. That prompt is a schema mutation asking for permission, not a routine confirmation.

The command itself may exit without applying anything if it hits an interactive prompt in a non-TTY shell. If the output ends without naming the migration, it did not run — check `migrate:status` before assuming success.

```bash
pnpm payload migrate
```

Expect the migration name in the output, no error, exit code 0. On failure: do not run `reset`/`fresh`; every statement is idempotent, so read the error, fix forward, re-run.

### Step 6 — Verify

```bash
psql "$DATABASE_URL" -tAc "select column_name, data_type, is_nullable from information_schema.columns where table_name='clients' and column_name in ('marketing_status','marketing_status_changed_at','unsubscribed_at') order by 1;"
psql "$DATABASE_URL" -tAc "select marketing_status, count(*) from clients group by 1 order by 1;"
psql "$DATABASE_URL" -tAc "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='enum_clients_marketing_status' order by e.enumsortorder;"
psql "$DATABASE_URL" -tAc "select indexname from pg_indexes where tablename='clients' order by 1;"
psql "$DATABASE_URL" -tAc "select name from payload_migrations order by created_at desc limit 1;"
```

Expect, in order:

1. `marketing_status` (`USER-DEFINED`, `NO` nullable) and `marketing_status_changed_at` (`timestamp with time zone`, nullable). **`unsubscribed_at` gone** — zero rows returned for it.
2. `subscribed = 2`, `never_asked = 230`, and no rows in `unsubscribed`/`bounced`/`complained`.
3. Five enum labels in this order: `never_asked`, `subscribed`, `unsubscribed`, `bounced`, `complained`.
4. `clients_marketing_status_idx` present; `clients_unsubscribed_at_idx` gone.
5. `20261021_000000_add_clients_marketing_status` as the newest row.

If the column is missing but the migration row exists, re-run Step 5 and re-check.

### Step 7 — Confirm types did not drift

```bash
pnpm generate:types
git status src/payload-types.ts
```

Expect no diff. `src/payload-types.ts` was already regenerated.

### Step 8 — Test locally before deploying

This is the step that prevents a deploy problem. Four checks, in order, cheapest first.

```bash
pnpm test:int                     # unit tests: csv, marketing rule, email
pnpm exec tsc --noEmit            # types
pnpm build                        # catches route-level breakage the dev server hides
pnpm dev                          # then click through
```

What each catches:

| Check | Catches |
| --- | --- |
| `pnpm test:int` | The sendable rule and CSV escaping regressing |
| `tsc --noEmit` | The new required field breaking any create path that forgot it — this is how `client-import` and `findOrCreateClient` were found |
| `pnpm build` | Route registration and server/client boundary errors that dev mode tolerates |
| `pnpm dev` | Real queries against the migrated database |

Then, in the dev server:

1. Log in, open `/dashboard`, click **Export for Brevo**.
2. Confirm the download is named `clients-brevo-<today>.csv`.
3. Confirm the header row and row count:

```bash
wc -l ~/Downloads/clients-brevo-*.csv
head -2 ~/Downloads/clients-brevo-*.csv
```

Expect **233 lines** (232 clients + header) and:

```text
email,firstname,lastname,consent_given,marketing_status,marketing_status_changed_at,repeat_customer
```

Then check the `?filter=sendable` variant returns **2 data rows**, matching the `subscribed = 2` count from Step 6.

Known non-blocker: `tsc --noEmit` also reports `Cannot find module 'pg'` in `tests/int/migrations/20260712_add_jobs_testimonial.int.spec.ts`. That predates this work — `pg` is installed transitively without type declarations. It does not affect the build.

### Step 9 — Deploy

Migration first, then code. The route selects `marketing_status`; deploying before the column exists makes the export 500.

```bash
git add -A && git commit -m "feat: track marketing status instead of a single unsubscribe date"
git push
```

Vercel does not run migrations during build. Step 5 is the only thing that applies them.

### Step 10 — Confirm in production

- Open the deployed `/dashboard`, click **Export for Brevo**.
- Confirm 233 lines and the same header as Step 8.
- In the Network tab: `Content-Type: text/csv`, `Cache-Control: no-store`, `X-Total-Clients: 232`, `X-Sendable-Clients: 2`.

---

## Rollback

| Situation | Action |
| --- | --- |
| Migrated, code not deployed | `pnpm payload migrate:down`. Recreates `unsubscribed_at` (populated only from `unsubscribed` rows, of which there are none). Bounce and complaint states have no equivalent and are lost. |
| Migrated, app misbehaving, data suspect | Restore the Step 3 dump, or use Supabase dashboard restore |
| Code deployed and broken, schema fine | Revert the commit and redeploy |
| Migration partially applied | Re-run `pnpm payload migrate` — every statement is idempotent |

`psql "$DATABASE_URL" < backup.sql` against the live database conflicts with existing objects. Prefer the Supabase dashboard restore, or restore into a fresh project and copy the table across.

---

## Command reference

| Command | Effect | Safe on production? |
| --- | --- | --- |
| `pnpm payload migrate:status` | lists applied and pending | yes — read only |
| `pnpm payload migrate` | applies all pending | yes, with a verified backup |
| `pnpm payload migrate:create` | generates a migration from config drift | writes to disk; review the diff — it will under-report due to the existing drift |
| `pnpm payload migrate:down` | reverts the **last** applied migration | yes, carefully |
| `pnpm payload migrate:refresh` | down all, then up all | no |
| `pnpm payload migrate:reset` | down all | **never** — drops every table |
| `pnpm payload migrate:fresh` | drop schema, then migrate | **never** — destroys all data |

---

## Open follow-ups

1. **Fix the drift.** Production gained `unsubscribed_at` without a migration record. Worth finding out how (a `pnpm dev` run against production will push schema automatically). Until it is fixed, `migrate:status` is not a reliable description of the database.
2. **Fix `db-backups/db-backup.sh`.** It lacks `set -euo pipefail`, an absolute output path, a non-empty check, `--no-owner --no-privileges`, and any printed totals — which is how the April 0-byte dumps were possible.
3. **Consent data.** 2 of 232 clients can legally receive marketing email. Before the next eblast, the consent question is a data-collection problem, not an export problem.
