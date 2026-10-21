import { Jobs } from "./collections/Jobs";
import { Clients } from "./collections/Clients";
import { Events } from "./collections/Events";
import { Organizations } from "./collections/Organizations";
import { IntakeEvents } from "./collections/IntakeEvents";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Users } from "./collections/Users";
import { Media } from "./collections/Media";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Origins allowed to make credentialed requests (Payload CSRF and CORS).
 *
 * Payload rejects the auth cookie when a request's `Origin` is absent from
 * `csrf`. Navigation sends no Origin (so SSR authenticates) while `fetch` always
 * does, which is why a missing origin looks like "the dashboard loads but
 * nothing saves".
 *
 * Two behaviours make this easy to get wrong:
 *  - An EMPTY list means "no restriction" (`csrf.length === 0` in extractJWT).
 *  - Payload appends `serverURL` only when it is non-empty.
 *
 * So a deployment with `SERVER_URL` unset used to run unrestricted, until
 * localhost origins made the list non-empty and the check strict - at which
 * point production writes were silently rejected. The production origin is
 * therefore listed explicitly: one missing env var must never be able to break
 * every client-side write.
 */
const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      process.env.SERVER_URL,
      ...(process.env.EXTRA_ORIGINS ?? "").split(","),
      "https://portal.petportraits.ink",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002",
    ]
      .map((origin) => origin?.trim())
      .filter((origin): origin is string => Boolean(origin)),
  ),
);

if (process.env.NODE_ENV === "production" && !process.env.SERVER_URL) {
  // Loud but non-fatal: CSRF still works from the explicit list, but absolute
  // URLs (password resets, admin redirects) will be wrong without this.
  console.warn(
    "[payload.config] SERVER_URL is not set. Absolute URLs will be relative. " +
      "Set it to the deployment origin, e.g. https://portal.petportraits.ink",
  );
}

export default buildConfig({
  serverURL: process.env.SERVER_URL || "",
  csrf: ALLOWED_ORIGINS,
  cors: ALLOWED_ORIGINS,
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      graphics: {
        Logo: "@/components/AdminLogo",
      },
    },
    meta: {
      titleSuffix: ' Pets.ink',
      icons: [
        {
          rel: 'icon',
          type: 'image/png',
          url: '/favicon.png', // Path relative to your public folder
        },
      ],
    },
  },
  collections: [Users, Media, Events, Clients, Jobs, Organizations, IntakeEvents],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "",
      // Cap connections per instance — Supabase session-mode pool limit is 15 total.
      // Vercel DATABASE_URL should use the transaction-mode pooler (port 6543).
      max: 3,
      idleTimeoutMillis: 10_000,
    },
    // Never let dev mode rewrite the schema. Without this, `next dev` compares the
    // live database against these collection configs and drops anything it does not
    // recognise - it did exactly that on 2026-10-21, deleting a snapshot table after
    // a "DATA LOSS WARNING" prompt was accepted. Schema changes go through
    // `payload migrate` only. See docs/000--concern--where-the-data-lives.md.
    push: false,
  }),
  sharp,
  plugins: [
    s3Storage({
      collections: {
        media: true,
      },
      bucket: process.env.SUPABASE_S3_BUCKET || "",
      config: {
        endpoint: process.env.SUPABASE_S3_ENDPOINT,
        region: process.env.SUPABASE_S3_REGION,
        credentials: {
          accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY || "",
        },
        forcePathStyle: true,
      },
    }),
  ],
});
