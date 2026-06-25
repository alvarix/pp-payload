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

export default buildConfig({
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
