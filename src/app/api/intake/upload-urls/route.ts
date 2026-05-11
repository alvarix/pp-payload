import { getPayload } from "payload";
import configPromise from "@payload-config";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { s3, S3_BUCKET } from "@/lib/s3";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 70 * 1024 * 1024;   // 70 MB per file
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB total

// 1×1 transparent PNG used to create a Payload media stub so we get a real
// ID and S3 key before the browser uploads the actual photo. The real file
// overwrites this placeholder via the presigned PUT URL.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

interface FileInfo {
  name: string;
  mimeType: string;
  size: number;
}

/**
 * POST /api/intake/upload-urls
 *
 * Accepts file metadata (no bytes), creates a Payload media stub for each
 * file, and returns presigned S3 PUT URLs. The browser uploads directly to
 * S3, bypassing the Vercel serverless function body limit entirely.
 *
 * @param request - JSON body: { files: [{ name, mimeType, size }] }
 */
export async function POST(request: NextRequest) {
  let files: FileInfo[];
  try {
    const body = await request.json();
    files = body.files;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Max ${MAX_FILES} files allowed` }, { status: 400 });
  }

  let totalSize = 0;
  for (const f of files) {
    if (!f.name || typeof f.mimeType !== "string" || typeof f.size !== "number") {
      return NextResponse.json(
        { error: "Each file requires name, mimeType, and size" },
        { status: 400 },
      );
    }
    if (!f.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: `Unsupported type: ${f.mimeType}` }, { status: 400 });
    }
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" exceeds 70 MB` }, { status: 400 });
    }
    totalSize += f.size;
  }
  if (totalSize > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "Total upload size exceeds 200 MB" }, { status: 400 });
  }

  const payload = await getPayload({ config: configPromise });

  const uploads = await Promise.all(
    files.map(async (f) => {
      const uuid = randomUUID();

      // Create a stub media record with the placeholder so Payload assigns an
      // ID and the S3 storage plugin writes the key we'll target with the
      // presigned URL.
      const media = await payload.create({
        collection: "media",
        data: { alt: "intake photo" },
        file: {
          data: PLACEHOLDER_PNG,
          mimetype: "image/png",
          name: `intake-${uuid}.png`,
          size: PLACEHOLDER_PNG.length,
        },
      });

      // The storage plugin stored the placeholder at media.filename in S3.
      // Generate a presigned PUT URL targeting that exact key so the browser
      // can overwrite it with the real photo.
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: media.filename as string,
          ContentType: f.mimeType,
        }),
        { expiresIn: 900 }, // 15 minutes
      );

      return {
        uploadUrl,
        mediaId: typeof media.id === "number" ? media.id : parseInt(media.id as string, 10),
      };
    }),
  );

  return NextResponse.json({ uploads });
}
