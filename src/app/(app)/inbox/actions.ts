"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { fileKey, sha256, validateUpload } from "@/lib/files";
import { requireOrg } from "@/lib/session";
import { putFile } from "@/lib/storage";

export type UploadResult =
  | { ok: true; invoiceId: string; duplicate: boolean; fileName: string }
  | { ok: false; error: string; fileName: string };

/** Uploads ONE invoice file. The client calls this once per file, which keeps each request small. */
export async function uploadInvoice(formData: FormData): Promise<UploadResult> {
  const { user, orgId } = await requireOrg();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received.", fileName: "" };
  const fileName = file.name.slice(0, 200);

  const bytes = Buffer.from(await file.arrayBuffer());
  const check = validateUpload(bytes);
  if (!check.ok) return { ok: false, error: check.error, fileName };

  const hash = sha256(bytes);

  // Same file already uploaded to this workspace? Don't store or process it twice.
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.fileHash, hash)))
    .limit(1);
  if (existing) return { ok: true, invoiceId: existing.id, duplicate: true, fileName };

  const key = fileKey(orgId, hash, check.type);
  await putFile(key, bytes, check.type);

  const [created] = await db
    .insert(invoices)
    .values({
      orgId,
      uploadedBy: user.id,
      fileKey: key,
      fileName,
      fileType: check.type,
      fileSize: bytes.byteLength,
      fileHash: hash,
      source: "upload",
    })
    // Two uploads of the same file at the same moment: the unique index decides, nobody errors.
    .onConflictDoNothing({ target: [invoices.orgId, invoices.fileHash] })
    .returning({ id: invoices.id });

  if (!created) {
    const [winner] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.fileHash, hash)))
      .limit(1);
    return { ok: true, invoiceId: winner!.id, duplicate: true, fileName };
  }

  // Week 4: this is where the `invoice/received` event is sent to start the AI pipeline.
  refresh();
  return { ok: true, invoiceId: created.id, duplicate: false, fileName };
}
