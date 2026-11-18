import { createHash } from "node:crypto";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, type AllowedType } from "./upload-limits";

export { ALLOWED_TYPES, MAX_UPLOAD_BYTES, type AllowedType };

export function sha256(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Checks the file's first bytes, so a renamed .exe can't pretend to be a PDF. */
export function sniffType(data: Uint8Array): AllowedType | null {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

export type UploadCheck =
  | { ok: true; type: AllowedType }
  | { ok: false; error: string };

export function validateUpload(data: Uint8Array): UploadCheck {
  if (data.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (data.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "Files must be 4 MB or smaller." };
  const type = sniffType(data);
  if (!type) return { ok: false, error: "Only PDF, PNG, JPEG and WebP files are supported." };
  return { ok: true, type };
}

/** Storage key: grouped by workspace, named by content hash so identical files map to one object. */
export function fileKey(orgId: string, hash: string, type: AllowedType) {
  return `${orgId}/${hash}.${ALLOWED_TYPES[type]}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
