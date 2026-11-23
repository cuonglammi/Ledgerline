"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { invoiceFields, invoiceLineItems, invoices } from "@/db/schema";
import { HEADER_FIELDS, type HeaderFieldName } from "@/lib/ai/invoice-schema";
import { processInvoice } from "@/lib/extraction/process-invoice";
import { checkInvoice, invoiceColumnsFrom, normalizeValue } from "@/lib/extraction/validate";
import { requireOrg } from "@/lib/session";

export type SaveState = { ok: boolean; message: string; fieldErrors?: Partial<Record<HeaderFieldName, string>> } | null;

const FORMAT_HINT = {
  text: "",
  date: "Use the format YYYY-MM-DD.",
  money: "Use a plain amount like 1234.56.",
  currency: "Use a 3-letter code like USD.",
} as const;

/**
 * Saves a reviewer's edits. The model's answer stays in `value`; the human's goes in
 * `corrected_value`, so every correction doubles as a labelled example for the eval set.
 */
export async function saveCorrections(invoiceId: string, _prev: SaveState, formData: FormData): Promise<SaveState> {
  const { user, orgId } = await requireOrg();

  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);
  if (!invoice) return { ok: false, message: "Invoice not found." };
  if (invoice.status !== "needs_review") return { ok: false, message: "This invoice can't be edited right now." };

  const rows = await db.select().from(invoiceFields).where(eq(invoiceFields.invoiceId, invoiceId));
  const byName = new Map(rows.map((r) => [r.fieldName, r]));

  const fieldErrors: Partial<Record<HeaderFieldName, string>> = {};
  const updates: { id: string; corrected: boolean; correctedValue: string | null }[] = [];
  const effective = {} as Record<HeaderFieldName, string | null>;

  for (const { name, kind, label } of HEADER_FIELDS) {
    const row = byName.get(name);
    const current = row ? (row.correctedAt ? row.correctedValue : row.value) : null;
    effective[name] = current;
    const raw = formData.get(name);
    if (!row || typeof raw !== "string") continue;

    const next = normalizeValue(kind, raw);
    if (raw.trim() !== "" && next === null) {
      fieldErrors[name] = `${label}: ${FORMAT_HINT[kind] || "invalid value."}`;
      continue;
    }
    if (next === current) continue;
    effective[name] = next;
    // Changed back to exactly what the AI said? Then it's no longer a correction.
    updates.push({ id: row.id, corrected: next !== row.value, correctedValue: next });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Some values need fixing.", fieldErrors };
  }
  if (updates.length === 0) return { ok: true, message: "No changes to save." };

  const lines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.position));
  const columns = invoiceColumnsFrom(effective);
  // Re-run the arithmetic checks on the corrected values, so fixed problems disappear.
  const issues = checkInvoice({
    subtotalCents: columns.subtotalCents,
    taxCents: columns.taxCents,
    totalCents: columns.totalCents,
    invoiceDate: effective.invoice_date,
    dueDate: effective.due_date,
    currency: columns.currency,
    lineItems: lines,
  });

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(invoiceFields)
        .set(
          u.corrected
            ? { correctedValue: u.correctedValue, correctedBy: user.id, correctedAt: now }
            : { correctedValue: null, correctedBy: null, correctedAt: null },
        )
        .where(and(eq(invoiceFields.id, u.id), eq(invoiceFields.orgId, orgId)));
    }
    await tx
      .update(invoices)
      .set({ ...columns, validationIssues: issues })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));
  });

  refresh();
  return { ok: true, message: `Saved ${updates.length} change${updates.length === 1 ? "" : "s"}.` };
}

/** Sends a failed (or never-processed) invoice through extraction. */
export async function retryExtraction(invoiceId: string): Promise<void> {
  const { orgId } = await requireOrg();
  const [queued] = await db
    .update(invoices)
    .set({ status: "received", extractionError: null })
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId), inArray(invoices.status, ["received", "failed"])),
    )
    .returning({ id: invoices.id });
  if (queued) after(() => processInvoice(invoiceId, orgId));
  refresh();
}
