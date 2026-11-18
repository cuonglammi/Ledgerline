import { describe, expect, it } from "vitest";
import { formatCents } from "@/lib/money";

describe("formatCents", () => {
  it("formats integer cents as currency", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-2500)).toBe("-$25.00");
  });

  it("shows a dash when the amount isn't known yet", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });

  it("respects the invoice currency", () => {
    expect(formatCents(1000, "EUR")).toBe("€10.00");
  });
});
