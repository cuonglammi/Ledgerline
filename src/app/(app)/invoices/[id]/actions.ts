"use server";

import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { invoiceFields, invoiceLineItems, invoices, type ValidationIssue } from "@/db/schema";
import { EXTRACTING_STALE_MS } from "@/lib/invoice-status";
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

  // One transaction, and the invoice row is locked first: two reviewers saving at the same time
  // are applied one after the other, so the second save sees the first one's corrections instead
  // of overwriting the invoice's totals with a stale snapshot.
  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ id: invoices.id, status: invoices.status, validationIssues: invoices.validationIssues })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
      .for("update")
      .limit(1);
    if (!invoice) return { ok: false, message: "Invoice not found." } satisfies SaveState;
    if (invoice.status !== "needs_review") {
      return { ok: false, message: "This invoice can't be edited right now." } satisfies SaveState;
    }
    return applyCorrections(tx, invoice, orgId, user.id, formData);
  });

  if (result.ok && result.message !== NO_CHANGES) refresh();
  return result;
}

const NO_CHANGES = "No changes to save.";

/** Issue codes that checkInvoice() recomputes. Any other issue (e.g. not_an_invoice) is kept on save. */
const RECOMPUTED: ReadonlySet<ValidationIssue["code"]> = new Set([
  "missing_total",
  "totals_mismatch",
  "line_items_mismatch",
  "line_amount_mismatch",
  "due_before_invoice",
]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyCorrections(
  tx: Tx,
  invoice: { id: string; validationIssues: ValidationIssue[] },
  orgId: string,
  userId: string,
  formData: FormData,
): Promise<NonNullable<SaveState>> {
  const invoiceId = invoice.id;
  const rows = await tx
    .select()
    .from(invoiceFields)
    .where(and(eq(invoiceFields.invoiceId, invoiceId), eq(invoiceFields.orgId, orgId)));
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
  if (updates.length === 0) return { ok: true, message: NO_CHANGES };

  const lines = await tx
    .select()
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.orgId, orgId)))
    .orderBy(asc(invoiceLineItems.position));
  const columns = invoiceColumnsFrom(effective);
  // Re-run the arithmetic checks on the corrected values, so fixed problems disappear. Issues the
  // checks can't recompute (like "not an invoice") are kept: editing a field doesn't resolve them.
  const issues = [
    ...invoice.validationIssues.filter((i) => !RECOMPUTED.has(i.code)),
    ...checkInvoice({
      subtotalCents: columns.subtotalCents,
      taxCents: columns.taxCents,
      totalCents: columns.totalCents,
      invoiceDate: effective.invoice_date,
      dueDate: effective.due_date,
      currency: columns.currency,
      lineItems: lines,
    }),
  ];

  const now = new Date();
  for (const u of updates) {
    await tx
      .update(invoiceFields)
      .set(
        u.corrected
          ? { correctedValue: u.correctedValue, correctedBy: userId, correctedAt: now }
          : { correctedValue: null, correctedBy: null, correctedAt: null },
      )
      .where(and(eq(invoiceFields.id, u.id), eq(invoiceFields.orgId, orgId)));
  }
  await tx
    .update(invoices)
    .set({ ...columns, validationIssues: issues })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));

  return { ok: true, message: `Saved ${updates.length} change${updates.length === 1 ? "" : "s"}.` };
}

/** Sends a failed, never-processed, or abandoned (stale `extracting`) invoice through extraction. */
export async function retryExtraction(invoiceId: string): Promise<void> {
  const { orgId } = await requireOrg();
  const [queued] = await db
    .update(invoices)
    .set({ status: "received", extractionError: null })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.orgId, orgId),
        or(
          inArray(invoices.status, ["received", "failed"]),
          // Only once it's stale, so this can't start a second model call next to a live one.
          and(
            eq(invoices.status, "extracting"),
            lt(invoices.updatedAt, new Date(Date.now() - EXTRACTING_STALE_MS)),
          ),
        ),
      ),
    )
    .returning({ id: invoices.id });
  if (queued) after(() => processInvoice(invoiceId, orgId));
  refresh();
}
