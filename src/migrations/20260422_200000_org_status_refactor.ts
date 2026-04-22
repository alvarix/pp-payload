import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_organizations_status" ADD VALUE IF NOT EXISTS 'past_collaborator';
    ALTER TYPE "public"."enum_organizations_status" ADD VALUE IF NOT EXISTS 'upcoming_event';
    ALTER TYPE "public"."enum_organizations_status" ADD VALUE IF NOT EXISTS 'ongoing_relationship';
  `)

  // Confirmed orgs with a future event → upcoming_event
  await db.execute(sql`
    UPDATE "organizations" o
    SET "status" = 'upcoming_event'
    WHERE o."status" = 'confirmed'
      AND EXISTS (
        SELECT 1 FROM "events" e
        WHERE e."organization_id" = o."id"
          AND e."start_at" >= NOW()
      );
  `)

  // Remaining confirmed → past_collaborator
  await db.execute(sql`
    UPDATE "organizations"
    SET "status" = 'past_collaborator'
    WHERE "status" = 'confirmed';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Reverse: collapse all three back to confirmed
  await db.execute(sql`
    UPDATE "organizations"
    SET "status" = 'confirmed'
    WHERE "status" IN ('past_collaborator', 'upcoming_event', 'ongoing_relationship');
  `)
  // Enum values cannot be removed in Postgres without recreating the type.
  // The three added values remain in the enum but are unused after rollback.
}
