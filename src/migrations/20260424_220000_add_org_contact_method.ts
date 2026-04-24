import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_organizations_contact_method"
      AS ENUM('eblast', 'personal_email', 'instagram', 'website_form', 'other');
  `);

  await db.execute(sql`
    ALTER TABLE "organizations"
    ADD COLUMN "contact_method" "public"."enum_organizations_contact_method";
  `);

  // Backfill: orgs created by the Brevo importer use the email as placeholder name
  await db.execute(sql`
    UPDATE "organizations"
    SET "contact_method" = 'eblast'
    WHERE "name" LIKE '%@%'
      AND "contact_method" IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organizations" DROP COLUMN "contact_method";
    DROP TYPE "public"."enum_organizations_contact_method";
  `);
}
