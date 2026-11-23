"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the server components every few seconds while something is still processing, so an
 * invoice's status and fields appear without a manual reload. Polling is fine at this scale; the
 * build plan lists server-sent events as a stretch goal.
 */
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
