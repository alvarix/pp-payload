import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_jobs_pets_sex" AS ENUM('male', 'female', 'unknown');
  CREATE TYPE "public"."enum_jobs_payment_methods_method" AS ENUM('website', 'pos', 'cash', 'venmo', 'zelle', 'other');
  CREATE TYPE "public"."enum_jobs_portfolio_images_image_tags" AS ENUM('main', 'thumbnail', 'alternate', 'wip', 'detail');
  CREATE TYPE "public"."enum_jobs_portfolio_reference_images_reference_tags" AS ENUM('featured', 'before', 'cropped', 'enhanced');
  CREATE TYPE "public"."enum_jobs_status" AS ENUM('new', 'intake_received', 'in_progress', 'awaiting_pics_or_payment', 'ready_to_ship', 'delivered', 'portfolio_ready');
  CREATE TYPE "public"."enum_jobs_portfolio_portfolio_status" AS ENUM('hidden', 'draft', 'published');
  CREATE TYPE "public"."enum_leads_type" AS ENUM('brewery', 'pet_store', 'gift_shop', 'gallery', 'cafe', 'venue', 'other');
  CREATE TYPE "public"."enum_leads_preferred_contact_method" AS ENUM('email', 'instagram_dm', 'contact_form', 'phone', 'in_person');
  CREATE TYPE "public"."enum_leads_fit_score" AS ENUM('top_tier', 'strong', 'worth_trying');
  CREATE TYPE "public"."enum_leads_status" AS ENUM('researched', 'contacted', 'responded', 'meeting_scheduled', 'confirmed', 'declined', 'no_response');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"start_at" timestamp(3) with time zone NOT NULL,
  	"end_at" timestamp(3) with time zone,
  	"location" varchar,
  	"description" jsonb,
  	"image_id" integer,
  	"status" "enum_events_status" DEFAULT 'draft' NOT NULL,
  	"featured" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "clients_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"email" varchar NOT NULL,
  	"notes" varchar,
  	"phone" varchar,
  	"company" varchar,
  	"price" numeric,
  	"marketing_consent" boolean DEFAULT false,
  	"portfolio_consent" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "jobs_pets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"sex" "enum_jobs_pets_sex",
  	"breed" varchar,
  	"personality" varchar,
  	"social_media" varchar
  );
  
  CREATE TABLE "jobs_payment_methods" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"method" "enum_jobs_payment_methods_method",
  	"amount" numeric,
  	"date" timestamp(3) with time zone
  );
  
  CREATE TABLE "jobs_portfolio_images_image_tags" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_jobs_portfolio_images_image_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "jobs_portfolio_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL
  );
  
  CREATE TABLE "jobs_portfolio_reference_images_reference_tags" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_jobs_portfolio_reference_images_reference_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "jobs_portfolio_reference_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"is_original" boolean DEFAULT true
  );
  
  CREATE TABLE "jobs_portfolio_portfolio_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"lead_id" integer,
  	"due_date" timestamp(3) with time zone,
  	"notes" varchar,
  	"status" "enum_jobs_status" DEFAULT 'new' NOT NULL,
  	"pics_received" boolean DEFAULT false,
  	"stripe_payment_intent_id" varchar,
  	"stripe_customer_id" varchar,
  	"shipping_address_line1" varchar,
  	"shipping_address_line2" varchar,
  	"shipping_address_city" varchar,
  	"shipping_address_state" varchar,
  	"shipping_address_postal_code" varchar,
  	"shipping_address_country" varchar DEFAULT 'US',
  	"referral" varchar,
  	"portfolio_testimonial" jsonb,
  	"portfolio_portfolio_status" "enum_jobs_portfolio_portfolio_status" DEFAULT 'hidden',
  	"portfolio_featured" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "jobs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_leads_type" NOT NULL,
  	"address" varchar,
  	"neighborhood" varchar,
  	"city" varchar DEFAULT 'Brooklyn',
  	"state" varchar DEFAULT 'NY',
  	"country" varchar DEFAULT 'US',
  	"latitude" numeric,
  	"longitude" numeric,
  	"place_id" varchar,
  	"instagram" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"website" varchar,
  	"preferred_contact_method" "enum_leads_preferred_contact_method",
  	"dog_friendly" boolean DEFAULT false,
  	"has_event_space" boolean DEFAULT false,
  	"pop_up_history" boolean DEFAULT false,
  	"independently_owned" boolean DEFAULT false,
  	"rating" numeric,
  	"fit_score" "enum_leads_fit_score",
  	"fit_notes" varchar,
  	"status" "enum_leads_status" DEFAULT 'researched' NOT NULL,
  	"date_contacted" timestamp(3) with time zone,
  	"follow_up_date" timestamp(3) with time zone,
  	"response_notes" varchar,
  	"event_date" timestamp(3) with time zone,
  	"event_terms" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"events_id" integer,
  	"clients_id" integer,
  	"jobs_id" integer,
  	"leads_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients_tags" ADD CONSTRAINT "clients_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_pets" ADD CONSTRAINT "jobs_pets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_payment_methods" ADD CONSTRAINT "jobs_payment_methods_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_images_image_tags" ADD CONSTRAINT "jobs_portfolio_images_image_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."jobs_portfolio_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_images" ADD CONSTRAINT "jobs_portfolio_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_images" ADD CONSTRAINT "jobs_portfolio_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_reference_images_reference_tags" ADD CONSTRAINT "jobs_portfolio_reference_images_reference_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."jobs_portfolio_reference_images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_reference_images" ADD CONSTRAINT "jobs_portfolio_reference_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_reference_images" ADD CONSTRAINT "jobs_portfolio_reference_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_portfolio_portfolio_tags" ADD CONSTRAINT "jobs_portfolio_portfolio_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "jobs_rels" ADD CONSTRAINT "jobs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "jobs_rels" ADD CONSTRAINT "jobs_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_jobs_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "events_slug_idx" ON "events" USING btree ("slug");
  CREATE INDEX "events_image_idx" ON "events" USING btree ("image_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "clients_tags_order_idx" ON "clients_tags" USING btree ("_order");
  CREATE INDEX "clients_tags_parent_id_idx" ON "clients_tags" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "clients_email_idx" ON "clients" USING btree ("email");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
  CREATE INDEX "jobs_pets_order_idx" ON "jobs_pets" USING btree ("_order");
  CREATE INDEX "jobs_pets_parent_id_idx" ON "jobs_pets" USING btree ("_parent_id");
  CREATE INDEX "jobs_payment_methods_order_idx" ON "jobs_payment_methods" USING btree ("_order");
  CREATE INDEX "jobs_payment_methods_parent_id_idx" ON "jobs_payment_methods" USING btree ("_parent_id");
  CREATE INDEX "jobs_portfolio_images_image_tags_order_idx" ON "jobs_portfolio_images_image_tags" USING btree ("order");
  CREATE INDEX "jobs_portfolio_images_image_tags_parent_idx" ON "jobs_portfolio_images_image_tags" USING btree ("parent_id");
  CREATE INDEX "jobs_portfolio_images_order_idx" ON "jobs_portfolio_images" USING btree ("_order");
  CREATE INDEX "jobs_portfolio_images_parent_id_idx" ON "jobs_portfolio_images" USING btree ("_parent_id");
  CREATE INDEX "jobs_portfolio_images_image_idx" ON "jobs_portfolio_images" USING btree ("image_id");
  CREATE INDEX "jobs_portfolio_reference_images_reference_tags_order_idx" ON "jobs_portfolio_reference_images_reference_tags" USING btree ("order");
  CREATE INDEX "jobs_portfolio_reference_images_reference_tags_parent_idx" ON "jobs_portfolio_reference_images_reference_tags" USING btree ("parent_id");
  CREATE INDEX "jobs_portfolio_reference_images_order_idx" ON "jobs_portfolio_reference_images" USING btree ("_order");
  CREATE INDEX "jobs_portfolio_reference_images_parent_id_idx" ON "jobs_portfolio_reference_images" USING btree ("_parent_id");
  CREATE INDEX "jobs_portfolio_reference_images_image_idx" ON "jobs_portfolio_reference_images" USING btree ("image_id");
  CREATE INDEX "jobs_portfolio_portfolio_tags_order_idx" ON "jobs_portfolio_portfolio_tags" USING btree ("_order");
  CREATE INDEX "jobs_portfolio_portfolio_tags_parent_id_idx" ON "jobs_portfolio_portfolio_tags" USING btree ("_parent_id");
  CREATE INDEX "jobs_client_idx" ON "jobs" USING btree ("client_id");
  CREATE INDEX "jobs_lead_idx" ON "jobs" USING btree ("lead_id");
  CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");
  CREATE INDEX "jobs_updated_at_idx" ON "jobs" USING btree ("updated_at");
  CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");
  CREATE INDEX "jobs_rels_order_idx" ON "jobs_rels" USING btree ("order");
  CREATE INDEX "jobs_rels_parent_idx" ON "jobs_rels" USING btree ("parent_id");
  CREATE INDEX "jobs_rels_path_idx" ON "jobs_rels" USING btree ("path");
  CREATE INDEX "jobs_rels_media_id_idx" ON "jobs_rels" USING btree ("media_id");
  CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("clients_id");
  CREATE INDEX "payload_locked_documents_rels_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("jobs_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("leads_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "clients_tags" CASCADE;
  DROP TABLE "clients" CASCADE;
  DROP TABLE "jobs_pets" CASCADE;
  DROP TABLE "jobs_payment_methods" CASCADE;
  DROP TABLE "jobs_portfolio_images_image_tags" CASCADE;
  DROP TABLE "jobs_portfolio_images" CASCADE;
  DROP TABLE "jobs_portfolio_reference_images_reference_tags" CASCADE;
  DROP TABLE "jobs_portfolio_reference_images" CASCADE;
  DROP TABLE "jobs_portfolio_portfolio_tags" CASCADE;
  DROP TABLE "jobs" CASCADE;
  DROP TABLE "jobs_rels" CASCADE;
  DROP TABLE "leads" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum_jobs_pets_sex";
  DROP TYPE "public"."enum_jobs_payment_methods_method";
  DROP TYPE "public"."enum_jobs_portfolio_images_image_tags";
  DROP TYPE "public"."enum_jobs_portfolio_reference_images_reference_tags";
  DROP TYPE "public"."enum_jobs_status";
  DROP TYPE "public"."enum_jobs_portfolio_portfolio_status";
  DROP TYPE "public"."enum_leads_type";
  DROP TYPE "public"."enum_leads_preferred_contact_method";
  DROP TYPE "public"."enum_leads_fit_score";
  DROP TYPE "public"."enum_leads_status";`)
}
