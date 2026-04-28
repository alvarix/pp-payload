import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organizations"
      ADD COLUMN "pinned" boolean DEFAULT false,
      ADD COLUMN "contact_notes" varchar;
  `);

  await db.execute(sql`
    ALTER TABLE "organizations_contacts"
      ADD COLUMN "notes" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organizations_contacts" DROP COLUMN "notes";
  `);

  await db.execute(sql`
    ALTER TABLE "organizations"
      DROP COLUMN "contact_notes",
      DROP COLUMN "pinned";
  `);
}
