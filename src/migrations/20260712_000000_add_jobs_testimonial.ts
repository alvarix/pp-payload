import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

/**
 * Adds testimonial text field to jobs and recovers data from the legacy
 * portfolio_testimonial JSONB column (removed from config, but still in DB).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	// Create the new testimonial column
	await db.execute(sql`
    ALTER TABLE "jobs" ADD COLUMN "testimonial" text;
  `);

	// Recover data: portfolio_testimonial is a JSONB column storing { testimonial: "..." }
	// Extract the inner text and migrate it to the new top-level column.
	await db.execute(sql`
    UPDATE "jobs"
    SET "testimonial" = "portfolio_testimonial" ->> 'testimonial'
    WHERE "portfolio_testimonial" IS NOT NULL
      AND "portfolio_testimonial" ->> 'testimonial' IS NOT NULL
      AND "portfolio_testimonial" ->> 'testimonial' != '';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "jobs" DROP COLUMN "testimonial";
  `);
}
