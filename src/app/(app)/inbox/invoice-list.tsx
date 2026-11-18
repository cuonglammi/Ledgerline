import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes } from "@/lib/files";
import { formatCents } from "@/lib/money";
import { requireOrg } from "@/lib/session";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export async function InvoiceList() {
  const { orgId } = await requireOrg();
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.orgId, orgId)) // never forget this filter: it's the tenant boundary
    .orderBy(desc(invoices.createdAt))
    .limit(100);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
        No invoices yet. Upload your first one above.
      </div>
    );
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="max-w-64">
                <Link href={`/invoices/${invoice.id}`} className="block truncate font-medium hover:underline">
                  {invoice.fileName}
                </Link>
                <span className="text-xs text-muted-foreground">{formatBytes(invoice.fileSize)}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">{invoice.vendorName ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCents(invoice.totalCents, invoice.currency)}
              </TableCell>
              <TableCell>
                <StatusBadge status={invoice.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{dateFormat.format(invoice.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function InvoiceListSkeleton() {
  return (
    <div className="grid gap-2 rounded-xl border p-4" aria-busy="true" aria-label="Loading invoices">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}
