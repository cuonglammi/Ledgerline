import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/db/schema";

const labels: Record<InvoiceStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  received: { label: "Received", variant: "outline" },
  extracting: { label: "Reading…", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "default" },
  matching: { label: "Matching…", variant: "secondary" },
  pending_approval: { label: "Awaiting approval", variant: "default" },
  approved: { label: "Approved", variant: "secondary" },
  exported: { label: "Exported", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, variant } = labels[status];
  return <Badge variant={variant}>{label}</Badge>;
}
