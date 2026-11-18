// Shared by the browser (upload form) and the server, so no Node-only imports in this file.

// Vercel functions accept request bodies up to ~4.5 MB, so uploads go through the server only up to 4 MB.
// Most invoice PDFs are well under 1 MB. Larger files would need direct-to-R2 presigned uploads (a later week).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export const ALLOWED_TYPES = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type AllowedType = keyof typeof ALLOWED_TYPES;
