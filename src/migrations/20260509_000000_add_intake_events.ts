import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Use a DO block so this is a no-op if the enum already exists
  // (e.g. local dev-mode push already created it).
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_intake_events_event_type" AS ENUM (
        'field_progress', 'validation_blocked', 'submit_failed', 'abandoned'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "intake_events" (
      "id"                serial PRIMARY KEY NOT NULL,
      "session_id"        varchar,
      "event_type"        "enum_intake_events_event_type",
      "form_snapshot"     jsonb,
      "error_details"     jsonb,
      "stripe_session_id" varchar,
      "user_agent"        varchar,
      "updated_at"        timestamp(3) with time zone,
      "created_at"        timestamp(3) with time zone
    );
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "intake_events_session_id_idx"
      ON "intake_events" USING btree ("session_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "intake_events";
    DROP TYPE IF EXISTS "public"."enum_intake_events_event_type";
  `)
}
