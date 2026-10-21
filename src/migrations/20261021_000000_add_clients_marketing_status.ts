import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

/**
 * Replaces the short-lived `clients.unsubscribed_at` date with a four-state
 * `marketing_status` plus the timestamp of when that state last changed.
 *
 * Why: a nullable date can only say "suppressed / not suppressed", so a hard
 * bounce and a spam complaint are indistinguishable from a healthy address.
 * `marketing_status` carries the reason, which is what decides whether retrying
 * is pointless (bounce) or actively harmful (complaint).
 *
 * Backfill order matters:
 *   1. Any `unsubscribed_at` data (if the previous migration was ever applied)
 *      becomes `unsubscribed` with its original timestamp.
 *   2. Remaining rows follow the existing `marketing_consent` flag.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	// Postgres has no CREATE TYPE IF NOT EXISTS, so guard on pg_type.
	await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'enum_clients_marketing_status'
      ) THEN
        CREATE TYPE "public"."enum_clients_marketing_status"
          AS ENUM('never_asked', 'subscribed', 'unsubscribed', 'bounced', 'complained');
      END IF;
    END $$;
  `);

	await db.execute(sql`
    ALTER TABLE "clients"
    ADD COLUMN IF NOT EXISTS "marketing_status" "public"."enum_clients_marketing_status"
      NOT NULL DEFAULT 'never_asked';
  `);

	await db.execute(sql`
    ALTER TABLE "clients"
    ADD COLUMN IF NOT EXISTS "marketing_status_changed_at" timestamp(3) with time zone;
  `);

	// Consent basis: why we are allowed to email the address.
	await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'enum_clients_consent_basis'
      ) THEN
        CREATE TYPE "public"."enum_clients_consent_basis"
          AS ENUM('express', 'existing_customer_us', 'none');
      END IF;
    END $$;
  `);

	await db.execute(sql`
    ALTER TABLE "clients"
    ADD COLUMN IF NOT EXISTS "consent_basis" "public"."enum_clients_consent_basis"
      NOT NULL DEFAULT 'existing_customer_us';
  `);

	await db.execute(sql`
    ALTER TABLE "clients"
    ADD COLUMN IF NOT EXISTS "consent_recorded_at" timestamp(3) with time zone;
  `);

	// Carry over the previous field's data if it exists. The column may never
	// have been created, so check information_schema rather than assuming.
	await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'unsubscribed_at'
      ) THEN
        UPDATE "clients"
        SET "marketing_status" = 'unsubscribed',
            "marketing_status_changed_at" = "unsubscribed_at"
        WHERE "unsubscribed_at" IS NOT NULL;
      END IF;
    END $$;
  `);

	// Record what is actually known before the bulk assertion overwrites it:
	// whoever already had the checkbox ticked gave express consent.
	await db.execute(sql`
    UPDATE "clients"
    SET "consent_basis" = 'express'
    WHERE "marketing_consent" IS TRUE;
  `);

	// Suppressed addresses keep their suppression and are not mailable.
	await db.execute(sql`
    UPDATE "clients"
    SET "marketing_consent" = false,
        "consent_basis" = 'none'
    WHERE "marketing_status" IN ('unsubscribed', 'bounced', 'complained');
  `);

	// Operator decision (2026-10-21): the remaining clients are US existing
	// customers, so they are mailable under CAN-SPAM's opt-out basis. The basis
	// and timestamp record that this was asserted in bulk rather than collected
	// per person, so the record stays honest about its own provenance.
	await db.execute(sql`
    UPDATE "clients"
    SET "marketing_status" = 'subscribed',
        "marketing_consent" = true,
        "consent_basis" = CASE
          WHEN "consent_basis" = 'express' THEN 'express'::"public"."enum_clients_consent_basis"
          ELSE 'existing_customer_us'::"public"."enum_clients_consent_basis"
        END,
        "consent_recorded_at" = COALESCE("consent_recorded_at", now()),
        "marketing_status_changed_at" = COALESCE("marketing_status_changed_at", now())
    WHERE "marketing_status" NOT IN ('unsubscribed', 'bounced', 'complained');
  `);

	// Retire the replaced field and its index.
	await db.execute(sql`
    DROP INDEX IF EXISTS "clients_unsubscribed_at_idx";
  `);

	await db.execute(sql`
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "unsubscribed_at";
  `);

	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "clients_marketing_status_idx"
    ON "clients" USING btree ("marketing_status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "clients"
    ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamp(3) with time zone;
  `);

	// Only unsubscribes can be expressed by the old field; bounce and complaint
	// states have no equivalent and are lost on rollback.
	await db.execute(sql`
    UPDATE "clients"
    SET "unsubscribed_at" = "marketing_status_changed_at"
    WHERE "marketing_status" = 'unsubscribed';
  `);

	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "clients_unsubscribed_at_idx"
    ON "clients" USING btree ("unsubscribed_at");
  `);

	// Revoke the bulk assertion: only express consent survives a rollback.
	await db.execute(sql`
    UPDATE "clients"
    SET "marketing_consent" = false
    WHERE "consent_basis" = 'existing_customer_us';
  `);

	await db.execute(sql`
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "consent_recorded_at";
  `);

	await db.execute(sql`
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "consent_basis";
  `);

	await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_clients_consent_basis";
  `);

	await db.execute(sql`
    DROP INDEX IF EXISTS "clients_marketing_status_idx";
  `);

	await db.execute(sql`
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "marketing_status_changed_at";
  `);

	await db.execute(sql`
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "marketing_status";
  `);

	await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_clients_marketing_status";
  `);
}
