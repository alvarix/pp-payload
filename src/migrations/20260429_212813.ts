import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Sessions table introduced in current Payload version
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users_sessions" (
      "_order"     integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id"         varchar PRIMARY KEY NOT NULL,
      "created_at" timestamp(3) with time zone,
      "expires_at" timestamp(3) with time zone
    );
    ALTER TABLE "users_sessions"
      ADD CONSTRAINT "users_sessions_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "users_sessions_order_idx"     ON "users_sessions" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  `)

  // Add age to pet records
  await db.execute(sql`
    ALTER TABLE "jobs_pets" ADD COLUMN IF NOT EXISTS "age" varchar;
  `)

  // Link jobs to events
  await db.execute(sql`
    ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "event_id" integer;
    ALTER TABLE "jobs"
      ADD CONSTRAINT "jobs_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
      ON DELETE set null ON UPDATE no action;
    CREATE INDEX "jobs_event_idx" ON "jobs" USING btree ("event_id");
  `)

  // Add portfolio_ready status value
  await db.execute(sql`
    ALTER TYPE "public"."enum_jobs_status" ADD VALUE IF NOT EXISTS 'portfolio_ready';
  `)

  // Finish index cleanup left over from the leads→organizations rename migration
  await db.execute(sql`
    DROP INDEX IF EXISTS "jobs_lead_idx";
    CREATE INDEX IF NOT EXISTS "jobs_organization_idx" ON "jobs" USING btree ("organization_id");
    DROP INDEX IF EXISTS "payload_locked_documents_rels_leads_id_idx";
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_organizations_id_idx"
      ON "payload_locked_documents_rels" USING btree ("organizations_id");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "jobs_organization_idx";
    DROP INDEX IF EXISTS "payload_locked_documents_rels_organizations_id_idx";
  `)

  await db.execute(sql`
    DROP INDEX IF EXISTS "jobs_event_idx";
    ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_event_id_events_id_fk";
    ALTER TABLE "jobs" DROP COLUMN IF EXISTS "event_id";
  `)

  await db.execute(sql`
    ALTER TABLE "jobs_pets" DROP COLUMN IF EXISTS "age";
  `)

  await db.execute(sql`
    DROP TABLE IF EXISTS "users_sessions" CASCADE;
  `)
}
