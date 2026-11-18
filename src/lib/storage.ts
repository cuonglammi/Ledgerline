import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage with two backends:
 * - R2_* env vars set → Cloudflare R2 (S3-compatible), used in production.
 * - otherwise → the local folder .data/uploads, so development needs no account.
 */
const r2Configured = Boolean(
  process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
);

const s3 = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

if (!s3 && process.env.VERCEL) {
  throw new Error("R2_* variables are not set. Uploads can't be stored on Vercel's temporary disk.");
}

// Local disk storage is a development fallback only; turbopackIgnore stops the build tracing these paths.
const localDir = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_UPLOAD_DIR ?? ".data/uploads");

function localPath(key: string) {
  const resolved = path.resolve(/*turbopackIgnore: true*/ localDir, key);
  // Guard against keys like "../../etc/passwd" escaping the upload folder.
  if (!resolved.startsWith(localDir + path.sep)) throw new Error("Invalid file key");
  return resolved;
}

export async function putFile(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getFile(key: string): Promise<Buffer> {
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}
