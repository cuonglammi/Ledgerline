import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** The signed-in user, or null. Reads the request, so call it inside a <Suspense> boundary. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * The Data Access Layer entry point: every page and action that touches invoices calls this first.
 * It guarantees a signed-in user AND an active workspace, and returns the orgId to filter every query by.
 */
export async function requireOrg() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const orgId = session.session.activeOrganizationId;
  if (!orgId) redirect("/onboarding");
  return { user: session.user, orgId };
}
