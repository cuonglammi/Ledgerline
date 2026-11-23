import { describe, expect, it } from "vitest";
import { escapeHtml, findHighlightedItems } from "@/lib/pdf-highlight";

const items = ["ACME SUPPLIES", "Invoice", "INV-", "1042", "Total due:", "$1,234.56"];

describe("findHighlightedItems", () => {
  it("finds a value inside a single text item", () => {
    expect([...findHighlightedItems(items, "$1,234.56")]).toEqual([5]);
  });

  it("finds a value split across several items, ignoring case and spacing", () => {
    expect([...findHighlightedItems(items, "inv-1042")]).toEqual([2, 3]);
    expect([...findHighlightedItems(items, "Total due: $1,234.56")]).toEqual([4, 5]);
  });

  it("falls back to ignoring punctuation the model dropped", () => {
    expect([...findHighlightedItems(items, "1234.56")]).toEqual([5]);
  });

  it("returns nothing for missing or too-short text", () => {
    expect(findHighlightedItems(items, "Globex").size).toBe(0);
    expect(findHighlightedItems(items, "$").size).toBe(0);
    expect(findHighlightedItems(items, null).size).toBe(0);
  });
});

describe("escapeHtml", () => {
  it("escapes text going into the PDF text layer", () => {
    expect(escapeHtml(`<b>"A&B"</b>`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });
});
