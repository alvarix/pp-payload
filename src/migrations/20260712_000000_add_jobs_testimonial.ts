import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

/**
 * Adds testimonial text field to jobs.
 * Attempts to recover data from the legacy portfolio_testimonial JSONB column
 * if it still exists (it may have been dropped by Payload auto-sync).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	// Create the testimonial column (idempotent)
	await db.execute(sql`
    ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "testimonial" text;
  `);

	// Try to recover data from legacy column if it still exists.
	// Use a DO block so missing column doesn't fail the migration.
	await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'portfolio_testimonial'
      ) THEN
        UPDATE "jobs"
        SET "testimonial" = "portfolio_testimonial" ->> 'testimonial'
        WHERE "portfolio_testimonial" IS NOT NULL
          AND "portfolio_testimonial" ->> 'testimonial' IS NOT NULL
          AND "portfolio_testimonial" ->> 'testimonial' != '';
      END IF;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "jobs" DROP COLUMN IF EXISTS "testimonial";
  `);
}
