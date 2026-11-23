import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatCents, parseMoneyToCents } from "@/lib/money";

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

  it("still shows the amount when the currency code is invalid", () => {
    expect(formatCents(1000, "US$")).toBe("10.00 US$");
  });
});

describe("parseMoneyToCents", () => {
  it("parses plain and formatted amounts without floating point error", () => {
    expect(parseMoneyToCents("1234.56")).toBe(123456);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
    expect(parseMoneyToCents("$ 99")).toBe(9900);
    expect(parseMoneyToCents("0.1")).toBe(10);
    expect(parseMoneyToCents("19.99")).toBe(1999); // 19.99 * 100 is 1998.9999999999998 as a float
    expect(parseMoneyToCents("USD 12.00")).toBe(1200);
  });

  it("handles credits", () => {
    expect(parseMoneyToCents("-12.50")).toBe(-1250);
    expect(parseMoneyToCents("(40.00)")).toBe(-4000);
    expect(parseMoneyToCents("-0.00")).toBe(0);
  });

  it("refuses to guess", () => {
    expect(parseMoneyToCents("12.345")).toBeNull(); // would need rounding
    expect(parseMoneyToCents("1.234,56")).toBeNull(); // European format: ambiguous
    expect(parseMoneyToCents("twelve")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
  });

  it("round-trips through centsToDecimalString", () => {
    for (const cents of [0, 5, 99, 100, 123456, -1250]) {
      expect(parseMoneyToCents(centsToDecimalString(cents))).toBe(cents);
    }
    expect(centsToDecimalString(-5)).toBe("-0.05");
    expect(centsToDecimalString(null)).toBe("");
  });
});
