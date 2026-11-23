import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, CircleAlert, Loader2, RotateCw } from "lucide-react";
import { db } from "@/db";
import { extractionRuns, invoiceFields, invoiceLineItems, invoices, type InvoiceField } from "@/db/schema";
import { AutoRefresh } from "@/components/auto-refresh";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { HEADER_FIELDS, type FieldKind } from "@/lib/ai/invoice-schema";
import { formatMicros } from "@/lib/ai/pricing";
import { formatBytes } from "@/lib/files";
import { isProcessing, isStuckReceived } from "@/lib/invoice-status";
import { centsToDecimalString, formatCents } from "@/lib/money";
import { requireOrg } from "@/lib/session";
import { retryExtraction } from "./actions";
import { ReviewWorkspace, type ReviewField, type ReviewLine } from "./review-workspace";

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/inbox" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Inbox
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <InvoiceDetail params={params} />
      </Suspense>
    </div>
  );
}

/** Stored value (dates as YYYY-MM-DD, money as cents) → what goes in the input box. */
function displayValue(kind: FieldKind, stored: string | null): string {
  if (stored === null) return "";
  return kind === "money" ? centsToDecimalString(Number(stored)) : stored;
}

function toReviewField(row: InvoiceField | undefined, def: (typeof HEADER_FIELDS)[number]): ReviewField {
  const corrected = Boolean(row?.correctedAt);
  return {
    name: def.name,
    label: def.label,
    kind: def.kind,
    value: displayValue(def.kind, corrected ? row!.correctedValue : (row?.value ?? null)),
    aiValue: displayValue(def.kind, row?.value ?? null),
    confidence: row?.confidence ?? null, // null = not extracted yet
    page: row?.page ?? null,
    sourceText: row?.sourceText ?? null,
    corrected,
  };
}

async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { orgId } = await requireOrg();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
    .limit(1);
  if (!invoice) notFound();

  // Child rows are filtered by org_id too: defence in depth for the tenant boundary.
  const [fieldRows, lineRows, [lastRun]] = await Promise.all([
    db.select().from(invoiceFields).where(and(eq(invoiceFields.invoiceId, id), eq(invoiceFields.orgId, orgId))),
    db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.orgId, orgId)))
      .orderBy(asc(invoiceLineItems.position)),
    db
      .select()
      .from(extractionRuns)
      .where(and(eq(extractionRuns.invoiceId, id), eq(extractionRuns.orgId, orgId)))
      .orderBy(desc(extractionRuns.createdAt))
      .limit(1),
  ]);

  const byName = new Map(fieldRows.map((r) => [r.fieldName, r]));
  const fields = HEADER_FIELDS.map((def) => toReviewField(byName.get(def.name), def));
  const lines: ReviewLine[] = lineRows.map((li) => ({
    id: li.id,
    description: li.description,
    quantity: li.quantity ? String(Number(li.quantity)) : "",
    unitPrice: li.unitPriceCents === null ? "" : formatCents(li.unitPriceCents, invoice.currency),
    amount: formatCents(li.amountCents, invoice.currency),
    confidence: li.confidence,
    page: li.page,
    sourceText: li.sourceText,
  }));

  const stuck = isStuckReceived(invoice);
  const processing = isProcessing(invoice);
  const fileUrl = `/api/invoices/${invoice.id}/file`;

  return (
    <div className="grid gap-4">
      <AutoRefresh active={processing} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold" title={invoice.fileName}>
            {invoice.vendorName ?? invoice.fileName}
            {invoice.invoiceNumber && <span className="text-muted-foreground"> · {invoice.invoiceNumber}</span>}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={invoice.status} />
            <span className="truncate">{invoice.fileName}</span>
            <span>{formatBytes(invoice.fileSize)}</span>
          </div>
        </div>
        {lastRun && (
          <p className="text-xs text-muted-foreground tabular-nums" title="The last AI extraction for this invoice">
            {lastRun.model} · prompt {lastRun.promptVersion} · {(lastRun.latencyMs / 1000).toFixed(1)}s ·{" "}
            {(lastRun.inputTokens + lastRun.outputTokens).toLocaleString("en-US")} tokens · {formatMicros(lastRun.costMicros)}
          </p>
        )}
      </div>

      {processing && (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Reading the invoice with AI. Fields appear here in a few seconds.
        </div>
      )}

      {stuck && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
          <span>This invoice hasn&apos;t been read yet.</span>
          <form action={retryExtraction.bind(null, invoice.id)}>
            <Button type="submit" size="sm">
              Read with AI
            </Button>
          </form>
        </div>
      )}

      {invoice.status === "failed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span className="flex items-center gap-2 text-destructive">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {invoice.extractionError ?? "Extraction failed."}
          </span>
          <form action={retryExtraction.bind(null, invoice.id)}>
            <Button type="submit" variant="outline" size="sm">
              <RotateCw aria-hidden /> Try again
            </Button>
          </form>
        </div>
      )}

      {invoice.validationIssues.length > 0 && (
        <ul className="grid gap-1 rounded-xl border border-yellow-500/50 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200">
          {invoice.validationIssues.map((issue, i) => (
            <li key={i} className="flex gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {issue.message}
            </li>
          ))}
        </ul>
      )}

      <ReviewWorkspace
        invoiceId={invoice.id}
        fileUrl={fileUrl}
        fileName={invoice.fileName}
        isPdf={invoice.fileType === "application/pdf"}
        editable={invoice.status === "needs_review"}
        fields={fields}
        lines={lines}
      />
    </div>
  );
}
