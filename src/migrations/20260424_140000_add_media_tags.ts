import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_media_tags"
      AS ENUM('portrait', 'outtake', 'promo', 'client', 'video', 'drawing');
  `);

  await db.execute(sql`
    CREATE TABLE "media_tags" (
      "order"     integer NOT NULL,
      "parent_id" integer NOT NULL,
      "value"     "enum_media_tags",
      "id"        serial PRIMARY KEY NOT NULL
    );

    ALTER TABLE "media_tags"
      ADD CONSTRAINT "media_tags_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id")
      ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "media_tags_order_idx"  ON "media_tags" USING btree ("order");
    CREATE INDEX "media_tags_parent_idx" ON "media_tags" USING btree ("parent_id");
  `);

  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN "is_video" boolean DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" DROP COLUMN "is_video";
    DROP TABLE "media_tags" CASCADE;
    DROP TYPE "public"."enum_media_tags";
  `);
}
