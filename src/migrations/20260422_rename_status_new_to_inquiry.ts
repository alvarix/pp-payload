import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_jobs_status" RENAME VALUE 'new' TO 'inquiry';
    UPDATE "jobs" SET "status" = 'inquiry' WHERE "status" = 'new';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_jobs_status" RENAME VALUE 'inquiry' TO 'new';
    UPDATE "jobs" SET "status" = 'new' WHERE "status" = 'inquiry';
  `)
}
