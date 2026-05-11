// OBSOLETE (2026-05-11). Kept for reference only — DO NOT RUN.
//
// Supabase's S3-compatible API does not implement PutBucketCors; this
// script fails with "The resource already exists". Local testing
// confirmed Supabase already permits cross-origin PUT for presigned
// URLs, so no CORS configuration is needed for the intake form's
// direct-upload flow.
//
// If a future change requires custom CORS rules, use the Supabase
// Management API instead:
//   PUT https://api.supabase.com/v1/projects/{ref}/config/storage

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  region: process.env.SUPABASE_S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const bucket = process.env.SUPABASE_S3_BUCKET;

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: ["https://petportraits.ink", "http://localhost:3000"],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3000,
    },
  ],
};

try {
  await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfig }));
  console.log("CORS set on bucket:", bucket);

  // Verify it was applied
  const result = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log("Verified:", JSON.stringify(result.CORSRules, null, 2));
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
}
