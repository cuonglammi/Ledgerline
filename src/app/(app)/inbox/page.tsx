import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoiceList, InvoiceListSkeleton } from "./invoice-list";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">Every invoice your workspace has received.</p>
      </div>
      <UploadForm />
      {/* The list reads the session and the database, so it streams in after the static shell. */}
      <Suspense fallback={<InvoiceListSkeleton />}>
        <InvoiceList />
      </Suspense>
    </div>
  );
}
