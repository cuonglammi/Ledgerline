import { describe, expect, it } from "vitest";
import { isProcessing, isStuck } from "@/lib/invoice-status";

const now = Date.parse("2026-11-23T12:00:00Z");
const ago = (ms: number) => new Date(now - ms);

describe("isStuck / isProcessing", () => {
  it("treats a fresh upload and a running extraction as processing", () => {
    for (const row of [
      { status: "received" as const, updatedAt: ago(5_000) },
      { status: "extracting" as const, updatedAt: ago(60_000) },
    ]) {
      expect(isProcessing(row, now)).toBe(true);
      expect(isStuck(row, now)).toBe(false);
    }
  });

  it("flags an upload nothing picked up within a minute", () => {
    const row = { status: "received" as const, updatedAt: ago(2 * 60_000) };
    expect(isStuck(row, now)).toBe(true);
    expect(isProcessing(row, now)).toBe(false);
  });

  it("flags an extraction abandoned for over five minutes, so it can be retried", () => {
    const row = { status: "extracting" as const, updatedAt: ago(6 * 60_000) };
    expect(isStuck(row, now)).toBe(true);
    expect(isProcessing(row, now)).toBe(false);
  });

  it("never flags finished invoices", () => {
    const row = { status: "needs_review" as const, updatedAt: ago(24 * 60 * 60_000) };
    expect(isStuck(row, now)).toBe(false);
    expect(isProcessing(row, now)).toBe(false);
  });
});
