import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getFile } from "@/lib/storage";

/** Streams an invoice's original file, but only to members of the workspace that owns it. */
export async function GET(request: Request, ctx: RouteContext<"/api/invoices/[id]/file">) {
  const session = await auth.api.getSession({ headers: request.headers });
  const orgId = session?.session.activeOrganizationId;
  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const [invoice] = await db
    .select({ fileKey: invoices.fileKey, fileType: invoices.fileType, fileName: invoices.fileName })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
    .limit(1)
    .catch(() => []); // malformed id → treat as not found
  if (!invoice) return new Response("Not found", { status: 404 });

  const body = await getFile(invoice.fileKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": invoice.fileType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(invoice.fileName)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
