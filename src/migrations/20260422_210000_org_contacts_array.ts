import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // New enum for preferredContactMethod inside the contacts array
  await db.execute(sql`
    CREATE TYPE "public"."enum_organizations_contacts_preferred_contact_method"
      AS ENUM('email', 'instagram_dm', 'contact_form', 'phone', 'in_person');
  `)

  // Array sub-table for contacts
  await db.execute(sql`
    CREATE TABLE "organizations_contacts" (
      "_order"     integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id"         varchar PRIMARY KEY NOT NULL,
      "contact_name" varchar,
      "role"       varchar,
      "email"      varchar,
      "phone"      varchar,
      "preferred_contact_method" "enum_organizations_contacts_preferred_contact_method"
    );

    ALTER TABLE "organizations_contacts"
      ADD CONSTRAINT "organizations_contacts_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."organizations"("id")
      ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "organizations_contacts_order_idx"  ON "organizations_contacts" USING btree ("_order");
    CREATE INDEX "organizations_contacts_parent_idx" ON "organizations_contacts" USING btree ("_parent_id");
  `)

  // Migrate existing email/phone into first contact row per org
  await db.execute(sql`
    INSERT INTO "organizations_contacts"
      ("_order", "_parent_id", "id", "email", "phone", "preferred_contact_method")
    SELECT
      1,
      o."id",
      gen_random_uuid()::varchar,
      NULLIF(o."email", ''),
      NULLIF(o."phone", ''),
      o."preferred_contact_method"
    FROM "organizations" o
    WHERE o."email" IS NOT NULL
       OR o."phone" IS NOT NULL
       OR o."preferred_contact_method" IS NOT NULL;
  `)

  // Add notes column, drop only preferredContactMethod (email/phone stay on org)
  await db.execute(sql`
    ALTER TABLE "organizations" ADD COLUMN "notes" varchar;
    ALTER TABLE "organizations" DROP COLUMN "preferred_contact_method";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "organizations" ADD COLUMN "preferred_contact_method"
      "enum_organizations_preferred_contact_method";
    ALTER TABLE "organizations" DROP COLUMN "notes";
  `)

  await db.execute(sql`
    DROP TABLE "organizations_contacts" CASCADE;
    DROP TYPE "public"."enum_organizations_contacts_preferred_contact_method";
  `)
}
