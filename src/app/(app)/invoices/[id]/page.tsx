import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes } from "@/lib/files";
import { formatCents } from "@/lib/money";
import { requireOrg } from "@/lib/session";

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

  const fileUrl = `/api/invoices/${invoice.id}/file`;
  const fields: [string, string][] = [
    ["Vendor", invoice.vendorName ?? "—"],
    ["Invoice #", invoice.invoiceNumber ?? "—"],
    ["Invoice date", invoice.invoiceDate?.toLocaleDateString("en-US") ?? "—"],
    ["Due date", invoice.dueDate?.toLocaleDateString("en-US") ?? "—"],
    ["Subtotal", formatCents(invoice.subtotalCents, invoice.currency)],
    ["Tax", formatCents(invoice.taxCents, invoice.currency)],
    ["Total", formatCents(invoice.totalCents, invoice.currency)],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="overflow-hidden rounded-xl border bg-muted/30">
        {invoice.fileType === "application/pdf" ? (
          <iframe src={fileUrl} title={invoice.fileName} className="h-[75vh] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; not for next/image
          <img src={fileUrl} alt={invoice.fileName} className="mx-auto max-h-[75vh] object-contain" />
        )}
      </section>

      <aside className="grid content-start gap-4">
        <div>
          <h1 className="truncate text-lg font-semibold" title={invoice.fileName}>
            {invoice.fileName}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={invoice.status} /> {formatBytes(invoice.fileSize)}
          </div>
        </div>
        <dl className="grid gap-3 rounded-xl border p-4 text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Fields fill in automatically once AI extraction is added in Week 2.
        </p>
      </aside>
    </div>
  );
}
