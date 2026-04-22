import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Drop FKs that reference leads table or lead_id columns
    ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_lead_id_leads_id_fk";
    ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_lead_id_leads_id_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_leads_fk";

    -- Rename table
    ALTER TABLE "leads" RENAME TO "organizations";

    -- Rename lead_id columns to organization_id
    ALTER TABLE "jobs" RENAME COLUMN "lead_id" TO "organization_id";
    ALTER TABLE "events" RENAME COLUMN "lead_id" TO "organization_id";
    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "leads_id" TO "organizations_id";

    -- Rename enum types
    ALTER TYPE "public"."enum_leads_type" RENAME TO "enum_organizations_type";
    ALTER TYPE "public"."enum_leads_preferred_contact_method" RENAME TO "enum_organizations_preferred_contact_method";
    ALTER TYPE "public"."enum_leads_fit_score" RENAME TO "enum_organizations_fit_score";
    ALTER TYPE "public"."enum_leads_status" RENAME TO "enum_organizations_status";

    -- Rename indexes
    DROP INDEX IF EXISTS "events_lead_idx";
    CREATE INDEX "events_organization_idx" ON "events" USING btree ("organization_id");

    -- Recreate FKs
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk"
      FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_organization_id_organizations_id_fk";
    ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_organization_id_organizations_id_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_organizations_fk";

    ALTER TABLE "organizations" RENAME TO "leads";
    ALTER TABLE "jobs" RENAME COLUMN "organization_id" TO "lead_id";
    ALTER TABLE "events" RENAME COLUMN "organization_id" TO "lead_id";
    ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "organizations_id" TO "leads_id";

    ALTER TYPE "public"."enum_organizations_type" RENAME TO "enum_leads_type";
    ALTER TYPE "public"."enum_organizations_preferred_contact_method" RENAME TO "enum_leads_preferred_contact_method";
    ALTER TYPE "public"."enum_organizations_fit_score" RENAME TO "enum_leads_fit_score";
    ALTER TYPE "public"."enum_organizations_status" RENAME TO "enum_leads_status";

    DROP INDEX IF EXISTS "events_organization_idx";
    CREATE INDEX "events_lead_idx" ON "events" USING btree ("lead_id");

    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lead_id_leads_id_fk"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk"
      FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  `)
}
