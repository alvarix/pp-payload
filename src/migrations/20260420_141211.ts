import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_jobs_job_type" AS ENUM('street', 'studio');
  CREATE TYPE "public"."enum_jobs_urgency" AS ENUM('low', 'medium', 'high');
  CREATE TYPE "public"."enum_jobs_delivery_method" AS ENUM('pickup', 'delivery', 'other');
  ALTER TABLE "events" ADD COLUMN "lead_id" integer;
  ALTER TABLE "clients" ADD COLUMN "address_street1" varchar;
  ALTER TABLE "clients" ADD COLUMN "address_street2" varchar;
  ALTER TABLE "clients" ADD COLUMN "address_city" varchar;
  ALTER TABLE "clients" ADD COLUMN "address_state" varchar;
  ALTER TABLE "clients" ADD COLUMN "address_zip" varchar;
  ALTER TABLE "clients" ADD COLUMN "address_country" varchar;
  ALTER TABLE "jobs" ADD COLUMN "job_type" "enum_jobs_job_type";
  ALTER TABLE "jobs" ADD COLUMN "urgency" "enum_jobs_urgency";
  ALTER TABLE "jobs" ADD COLUMN "delivery_method" "enum_jobs_delivery_method";
  ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_lead_idx" ON "events" USING btree ("lead_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" DROP CONSTRAINT "events_lead_id_leads_id_fk";
  
  DROP INDEX "events_lead_idx";
  ALTER TABLE "events" DROP COLUMN "lead_id";
  ALTER TABLE "clients" DROP COLUMN "address_street1";
  ALTER TABLE "clients" DROP COLUMN "address_street2";
  ALTER TABLE "clients" DROP COLUMN "address_city";
  ALTER TABLE "clients" DROP COLUMN "address_state";
  ALTER TABLE "clients" DROP COLUMN "address_zip";
  ALTER TABLE "clients" DROP COLUMN "address_country";
  ALTER TABLE "jobs" DROP COLUMN "job_type";
  ALTER TABLE "jobs" DROP COLUMN "urgency";
  ALTER TABLE "jobs" DROP COLUMN "delivery_method";
  DROP TYPE "public"."enum_jobs_job_type";
  DROP TYPE "public"."enum_jobs_urgency";
  DROP TYPE "public"."enum_jobs_delivery_method";`)
}
