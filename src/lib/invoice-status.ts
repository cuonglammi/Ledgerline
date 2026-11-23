import type { InvoiceStatus } from "@/db/schema";

/** How long an invoice may sit in `received` before we assume nothing is going to pick it up. */
const RECEIVED_GRACE_MS = 60_000;

/**
 * An invoice in `extracting` for this long is assumed abandoned (e.g. the server stopped mid-call)
 * and may be claimed again. A real extraction takes seconds, well inside this window.
 */
export const EXTRACTING_STALE_MS = 5 * 60_000;

type Row = { status: InvoiceStatus; updatedAt: Date };

/**
 * Nothing is working on this invoice even though it hasn't been read: it sat in `received` (uploaded
 * before extraction existed, or its server stopped before starting), or its extraction was abandoned
 * mid-way. The UI offers a manual start for these.
 * (Called from server components, which render once per request, so reading the clock is fine.)
 */
export function isStuck(invoice: Row, now = Date.now()): boolean {
  const age = now - invoice.updatedAt.getTime();
  return (
    (invoice.status === "received" && age > RECEIVED_GRACE_MS) ||
    (invoice.status === "extracting" && age > EXTRACTING_STALE_MS)
  );
}

/** The AI is (or is about to be) reading this invoice, so the UI should keep polling. */
export function isProcessing(invoice: Row, now = Date.now()): boolean {
  return (invoice.status === "received" || invoice.status === "extracting") && !isStuck(invoice, now);
}
