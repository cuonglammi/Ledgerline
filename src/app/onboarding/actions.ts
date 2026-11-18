"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";

const schema = z.object({ name: z.string().trim().min(2, "Use at least 2 characters.").max(80) });

export type OnboardingState = { error?: string };

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  // Random suffix keeps slugs unique without a lookup ("acme-landscaping-4k2j").
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createWorkspace(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Creates the organization, adds this user as its owner, and makes it the active workspace.
  await auth.api.createOrganization({
    body: { name: parsed.data.name, slug: slugify(parsed.data.name) },
    headers: await headers(),
  });

  redirect("/inbox");
}
