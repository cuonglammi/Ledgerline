import "server-only";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { extractionRuns, invoiceFields, invoiceLineItems, invoices } from "@/db/schema";
import { extractInvoice } from "@/lib/ai/extract-invoice";
import { HEADER_FIELDS, type HeaderFieldName } from "@/lib/ai/invoice-schema";
import type { AllowedType } from "@/lib/upload-limits";
import { getFile } from "@/lib/storage";
import { invoiceColumnsFrom, validateExtraction } from "./validate";

/** An invoice stuck in `extracting` this long is assumed abandoned (e.g. the server restarted) and can be retried. */
const STALE_AFTER_MS = 5 * 60_000;

/**
 * received → extracting → needs_review (or failed).
 *
 * Week 2 runs this right after the upload response is sent (next/server `after`). Week 4 moves the
 * same steps into an Inngest function with per-step retries.
 */
export async function processInvoice(invoiceId: string, orgId: string): Promise<void> {
  // Claim the invoice atomically, so two triggers (double click, retry) can't both call the model.
  const [invoice] = await db
    .update(invoices)
    .set({ status: "extracting", extractionError: null })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.orgId, orgId),
        or(
          inArray(invoices.status, ["received", "failed"]),
          and(eq(invoices.status, "extracting"), lt(invoices.updatedAt, new Date(Date.now() - STALE_AFTER_MS))),
        ),
      ),
    )
    .returning();
  if (!invoice) return;

  try {
    const file = await getFile(invoice.fileKey);
    const attempt = await extractInvoice(file, invoice.fileType as AllowedType);

    await db.insert(extractionRuns).values({
      orgId,
      invoiceId,
      model: attempt.model,
      promptVersion: attempt.promptVersion,
      status: attempt.status,
      stopReason: attempt.stopReason,
      inputTokens: attempt.usage.input_tokens,
      outputTokens: attempt.usage.output_tokens,
      costMicros: attempt.costMicros,
      latencyMs: attempt.latencyMs,
      error: attempt.status === "succeeded" ? null : attempt.error,
    });

    if (attempt.status !== "succeeded") {
      await markFailed(invoiceId, attempt.error);
      return;
    }

    const { fields, lineItems, issues } = validateExtraction(attempt.data);
    const values = Object.fromEntries(HEADER_FIELDS.map(({ name }) => [name, fields[name].value])) as Record<
      HeaderFieldName,
      string | null
    >;

    await db.transaction(async (tx) => {
      // Only reachable from received/failed, so there are no human corrections to lose here.
      await tx.delete(invoiceFields).where(eq(invoiceFields.invoiceId, invoiceId));
      await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
      await tx.insert(invoiceFields).values(
        HEADER_FIELDS.map(({ name }) => ({
          orgId,
          invoiceId,
          fieldName: name,
          value: fields[name].value,
          confidence: fields[name].confidence,
          page: fields[name].page,
          sourceText: fields[name].sourceText,
        })),
      );
      if (lineItems.length > 0) {
        await tx.insert(invoiceLineItems).values(lineItems.map((li) => ({ ...li, orgId, invoiceId })));
      }
      await tx
        .update(invoices)
        .set({ ...invoiceColumnsFrom(values), status: "needs_review", validationIssues: issues })
        .where(eq(invoices.id, invoiceId));
    });
  } catch (err) {
    console.error(`[extraction] invoice ${invoiceId} failed`, err);
    await markFailed(invoiceId, "Something went wrong while reading this invoice. Try again.");
  }
}

async function markFailed(invoiceId: string, error: string) {
  await db.update(invoices).set({ status: "failed", extractionError: error }).where(eq(invoices.id, invoiceId));
}
