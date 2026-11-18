import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  // In production set BETTER_AUTH_SECRET and BETTER_AUTH_URL (see .env.example).
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [
    // Teams ("organizations"): every invoice belongs to one. Roles: owner, admin, member.
    organization(),
    // Lets server actions set auth cookies. Must stay the last plugin.
    nextCookies(),
  ],
  databaseHooks: {
    session: {
      create: {
        // When someone signs in, open the first workspace they belong to.
        before: async (session) => {
          const [membership] = await db
            .select({ organizationId: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId))
            .orderBy(asc(schema.member.createdAt))
            .limit(1);
          return { data: { ...session, activeOrganizationId: membership?.organizationId ?? null } };
        },
      },
    },
  },
});
