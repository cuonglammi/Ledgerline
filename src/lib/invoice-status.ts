import type { InvoiceStatus } from "@/db/schema";

/** How long an invoice may sit in `received` before we assume nothing is going to pick it up. */
const RECEIVED_GRACE_MS = 60_000;

type Row = { status: InvoiceStatus; updatedAt: Date };

/**
 * A `received` invoice is normally picked up within a second of upload. One that has been sitting
 * there was uploaded before extraction existed, or its server stopped mid-request: offer a manual start.
 * (Called from server components, which render once per request, so reading the clock is fine.)
 */
export function isStuckReceived(invoice: Row, now = Date.now()): boolean {
  return invoice.status === "received" && now - invoice.updatedAt.getTime() > RECEIVED_GRACE_MS;
}

/** The AI is (or is about to be) reading this invoice, so the UI should keep polling. */
export function isProcessing(invoice: Row, now = Date.now()): boolean {
  return invoice.status === "extracting" || (invoice.status === "received" && !isStuckReceived(invoice, now));
}
