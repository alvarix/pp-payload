import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_jobs_stripe_payment_status" AS ENUM('paid', 'unpaid', 'no_payment_required');
  CREATE TABLE "jobs_stripe_discount_codes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" varchar
  );
  
  ALTER TABLE "jobs" ADD COLUMN "stripe_checkout_session_id" varchar;
  ALTER TABLE "jobs" ADD COLUMN "stripe_payment_link_id" varchar;
  ALTER TABLE "jobs" ADD COLUMN "stripe_amount_paid_cents" numeric;
  ALTER TABLE "jobs" ADD COLUMN "stripe_currency" varchar DEFAULT 'usd';
  ALTER TABLE "jobs" ADD COLUMN "stripe_payment_status" "enum_jobs_stripe_payment_status";
  ALTER TABLE "jobs" ADD COLUMN "stripe_amount_discount_cents" numeric DEFAULT 0;
  ALTER TABLE "jobs_stripe_discount_codes" ADD CONSTRAINT "jobs_stripe_discount_codes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "jobs_stripe_discount_codes_order_idx" ON "jobs_stripe_discount_codes" USING btree ("_order");
  CREATE INDEX "jobs_stripe_discount_codes_parent_id_idx" ON "jobs_stripe_discount_codes" USING btree ("_parent_id");
  CREATE INDEX "jobs_stripe_checkout_session_id_idx" ON "jobs" USING btree ("stripe_checkout_session_id");
  CREATE INDEX "jobs_stripe_payment_link_id_idx" ON "jobs" USING btree ("stripe_payment_link_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "jobs_stripe_discount_codes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "jobs_stripe_discount_codes" CASCADE;
  DROP INDEX "jobs_stripe_checkout_session_id_idx";
  DROP INDEX "jobs_stripe_payment_link_id_idx";
  ALTER TABLE "jobs" DROP COLUMN "stripe_checkout_session_id";
  ALTER TABLE "jobs" DROP COLUMN "stripe_payment_link_id";
  ALTER TABLE "jobs" DROP COLUMN "stripe_amount_paid_cents";
  ALTER TABLE "jobs" DROP COLUMN "stripe_currency";
  ALTER TABLE "jobs" DROP COLUMN "stripe_payment_status";
  ALTER TABLE "jobs" DROP COLUMN "stripe_amount_discount_cents";
  DROP TYPE "public"."enum_jobs_stripe_payment_status";`)
}
