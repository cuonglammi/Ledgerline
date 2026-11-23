import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage with two backends:
 * - R2_* env vars set → Cloudflare R2 (S3-compatible), used in production.
 * - otherwise → the local folder .data/uploads, so development needs no account.
 */
let s3: S3Client | null | undefined; // undefined = not decided yet

/**
 * Picks the backend on first use, not when this file is imported. `next build` imports every route
 * to collect page data, so an import-time check would fail the whole build (e.g. a Preview
 * deployment without R2 secrets) instead of failing just the request that needs storage.
 */
function r2(): S3Client | null {
  if (s3 !== undefined) return s3;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  } else if (process.env.VERCEL) {
    // Not cached, so adding the variables and redeploying is enough to recover.
    throw new Error("R2_* variables are not set. Uploads can't be stored on Vercel's temporary disk.");
  } else {
    s3 = null;
  }
  return s3;
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
  const s3 = r2();
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
  const s3 = r2();
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}
