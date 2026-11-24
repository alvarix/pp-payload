import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

/**
 * Unique index on jobs.stripe_payment_intent_id — the DB-level backstop for
 * the webhook/intake create race: if both producers pass the dedupe check
 * concurrently, the second insert fails with 23505 instead of creating a
 * duplicate Job. NULL values are allowed multiple times by Postgres, so
 * jobs without a Stripe payment intent (manual entry) are unaffected.
 *
 * Run a duplicate check BEFORE applying (see docs/023--llm--spec.md):
 *   SELECT stripe_payment_intent_id, COUNT(*)
 *   FROM jobs WHERE stripe_payment_intent_id IS NOT NULL
 *   GROUP BY 1 HAVING COUNT(*) > 1;
 * If that returns rows, stop and reconcile manually first — CREATE UNIQUE
 * INDEX will fail and abort the migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "jobs_stripe_payment_intent_id_unique_idx"
    ON "jobs" ("stripe_payment_intent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    DROP INDEX IF EXISTS "jobs_stripe_payment_intent_id_unique_idx";
  `);
}