import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS stripe_amount_tax_cents numeric DEFAULT 0;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE jobs DROP COLUMN IF EXISTS stripe_amount_tax_cents;
  `);
}
