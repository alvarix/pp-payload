# Skill: `pnpm payload migrate` — Common Errors & Fixes

## Context

This project uses Payload CMS with `@payloadcms/db-postgres` (Drizzle under the hood).
Local dev typically uses `payload dev` which pushes schema changes dynamically
("dev mode"). Migrations are hand-written and run with `pnpm payload migrate`.

---

## Error 1: `syntax error at or near "NOT"` on `CREATE TYPE IF NOT EXISTS`

### Symptom

```
ERROR: Error running migration <name>
caused by: error: syntax error at or near "NOT"
```

Migration contains:

```sql
CREATE TYPE IF NOT EXISTS "public"."enum_foo" AS ENUM (...);
```

### Root causes (either/both)

1. **PostgreSQL version** — `CREATE TYPE IF NOT EXISTS` for ENUM types is not
   supported on all Postgres versions. Locally you may be on an older version than
   the Supabase production instance.

2. **Drizzle `sql` tag with multiple statements** — passing several DDL statements
   in one `db.execute(sql`...`)` call can cause parse errors. Drizzle expects
   single statements per execute call.

### Fix

Split into separate `db.execute()` calls and replace `CREATE TYPE IF NOT EXISTS`
with a `DO` block that catches the `duplicate_object` exception:

```typescript
// BEFORE (broken)
await db.execute(sql`
  CREATE TYPE IF NOT EXISTS "public"."enum_foo" AS ENUM ('a', 'b');
  CREATE TABLE IF NOT EXISTS "bar" (...);
  CREATE INDEX IF NOT EXISTS ...;
`)

// AFTER (safe)
await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_foo" AS ENUM ('a', 'b');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;
`)

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "bar" (...);
`)

await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "bar_idx" ON "bar" USING btree ("col");
`)
```

### Rule going forward

- **One statement per `db.execute()` call** — always.
- **Never use `CREATE TYPE IF NOT EXISTS`** — use the `DO / EXCEPTION` pattern.
- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are fine as-is.

---

## Error 2: Dev-mode schema drift — migrations fail on already-existing objects

### Symptom

Migration fails because a table/column/index already exists in the local DB,
having been pushed by `payload dev` before migrations were written.

### Fix (preferred — non-destructive)

Mark the already-applied migration as done without re-running it by inserting
directly into the migrations tracking table, then run only the new migration:

```sql
-- Run in psql or Supabase SQL editor
INSERT INTO payload_migrations (name, batch, "updatedAt", "createdAt")
VALUES ('20260509_000000_add_intake_events', 1, now(), now());
```

Then:

```bash
pnpm payload migrate
```

### Fix (nuclear — local dev only)

If the local DB is expendable:

```bash
# Drop and recreate via Payload
pnpm payload migrate:fresh
```

⚠️ Never use `migrate:fresh` against production or staging.

---

## Error 3: Payload prompt — "dev mode detected, data loss will occur"

### Symptom

```
✔ It looks like you've run Payload in dev mode …
  Would you like to proceed? › yes
```

Payload detected schema drift between the current state and the migration history.
Proceeding re-runs all unapplied migrations; if the DB already has those objects
from dev-mode pushes, individual migrations may fail (see Error 1 / Error 2).

### Rule

- Keep local dev on a **throwaway local Postgres** instance so dev-mode drift
  doesn't matter.
- Production / Supabase should only ever be updated via `pnpm payload migrate`
  (never dev mode).

---

## General Migration Checklist

Before writing a migration:

1. Back up first: `bash db-backup.sh`
2. One `db.execute()` per statement.
3. Use `DO / EXCEPTION WHEN duplicate_object` for ENUM types.
4. Use `IF NOT EXISTS` for tables and indexes.
5. Always write a matching `down()` function.
6. Test locally, then deploy — Vercel runs `pnpm payload migrate` as part of build
   (or trigger manually via Vercel CLI).

---

## Reference

- Payload migration docs: https://payloadcms.com/docs/database/migrations
- Drizzle `sql` tag: https://orm.drizzle.team/docs/sql
- PostgreSQL `DO` block: https://www.postgresql.org/docs/current/sql-do.html
