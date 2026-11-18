import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { requireOrg } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export async function UserMenu() {
  const { user, orgId } = await requireOrg();
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted-foreground sm:inline">
        {org?.name} · {user.email}
      </span>
      <SignOutButton />
    </div>
  );
}
