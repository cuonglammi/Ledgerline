import { describe, expect, it } from "vitest";
import type { InvoiceExtraction } from "@/lib/ai/invoice-schema";
import {
  checkInvoice,
  invoiceColumnsFrom,
  lineExtensionCents,
  normalizeDate,
  validateExtraction,
} from "@/lib/extraction/validate";

const f = (value: string | null, confidence = 0.95) => ({ value, confidence, page: 1, source_text: value });

/** A correct invoice: 2 × 50.00 + 1 × 20.00 = 120.00, + 9.60 tax = 129.60. */
function invoice(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    is_invoice: true,
    vendor_name: f("Acme Supplies Ltd"),
    invoice_number: f("INV-1042"),
    invoice_date: f("2026-11-01"),
    due_date: f("2026-12-01"),
    currency: f("usd"),
    subtotal: f("120.00"),
    tax: f("9.60"),
    total: f("129.60"),
    line_items: [
      { description: "Widgets", quantity: "2", unit_price: "50.00", amount: "100.00", confidence: 0.9, page: 1, source_text: "Widgets" },
      { description: "Delivery", quantity: "1", unit_price: "20.00", amount: "20.00", confidence: 0.9, page: 1, source_text: "Delivery" },
    ],
    ...overrides,
  };
}

describe("validateExtraction", () => {
  it("passes a consistent invoice and normalises values", () => {
    const { fields, lineItems, issues } = validateExtraction(invoice());
    expect(issues).toEqual([]);
    expect(fields.total.value).toBe("12960");
    expect(fields.currency.value).toBe("USD");
    expect(fields.total.confidence).toBe(0.95);
    expect(lineItems.map((l) => l.amountCents)).toEqual([10000, 2000]);
  });

  it("flags totals that don't add up and lowers confidence below the review threshold", () => {
    const { fields, issues } = validateExtraction(invoice({ total: f("139.60") }));
    expect(issues.map((i) => i.code)).toEqual(["totals_mismatch"]);
    expect(issues[0].message).toContain("$129.60");
    expect(fields.total.confidence).toBeLessThan(0.8);
    expect(fields.subtotal.confidence).toBeLessThan(0.8);
    expect(fields.vendor_name.confidence).toBe(0.95); // untouched
  });

  it("flags line items that don't sum to the subtotal", () => {
    const data = invoice();
    data.line_items[1].amount = "25.00";
    data.line_items[1].unit_price = "25.00";
    const { lineItems, issues } = validateExtraction(data);
    expect(issues.map((i) => i.code)).toEqual(["line_items_mismatch"]);
    expect(lineItems.every((l) => l.confidence < 0.8)).toBe(true);
  });

  it("flags a single line whose quantity × price is wrong", () => {
    const data = invoice({ subtotal: f("130.00"), total: f("139.60") });
    data.line_items[0].amount = "110.00"; // 2 × 50.00 is 100.00
    const { lineItems, issues } = validateExtraction(data);
    expect(issues.map((i) => i.code)).toEqual(["line_amount_mismatch"]);
    expect(lineItems[0].confidence).toBeLessThan(0.8);
    expect(lineItems[1].confidence).toBe(0.9);
  });

  it("empties values it can't understand instead of guessing", () => {
    const { fields } = validateExtraction(invoice({ invoice_date: f("next Tuesday"), tax: f("about 10") }));
    expect(fields.invoice_date.value).toBeNull();
    expect(fields.invoice_date.confidence).toBe(0);
    expect(fields.tax.value).toBeNull();
  });

  it("clamps out-of-range confidence from the model", () => {
    const { fields } = validateExtraction(invoice({ vendor_name: f("Acme", 1.4) }));
    expect(fields.vendor_name.confidence).toBe(1);
  });

  it("flags documents that aren't invoices", () => {
    const { issues } = validateExtraction(invoice({ is_invoice: false }));
    expect(issues[0].code).toBe("not_an_invoice");
  });
});

describe("checkInvoice", () => {
  const base = {
    subtotalCents: 10000,
    taxCents: 0,
    totalCents: 10000,
    invoiceDate: "2026-11-01",
    dueDate: "2026-12-01",
    currency: "USD",
    lineItems: [],
  };

  it("uses total minus tax when there's no subtotal", () => {
    const issues = checkInvoice({
      ...base,
      subtotalCents: null,
      taxCents: 500,
      totalCents: 10500,
      lineItems: [{ quantity: null, unitPriceCents: null, amountCents: 10000 }],
    });
    expect(issues).toEqual([]);
  });

  it("flags a due date before the invoice date and a missing total", () => {
    const codes = checkInvoice({ ...base, totalCents: null, dueDate: "2026-10-01" }).map((i) => i.code);
    expect(codes).toEqual(["missing_total", "due_before_invoice"]);
  });
});

describe("lineExtensionCents", () => {
  it("multiplies exactly, including fractional quantities", () => {
    expect(lineExtensionCents("3", 1999)).toBe(5997);
    expect(lineExtensionCents("2.5", 8000)).toBe(20000);
    expect(lineExtensionCents("0.3333", 300)).toBe(100); // 99.99 cents rounds to 100
    expect(lineExtensionCents("-2", 500)).toBe(-1000);
  });
});

describe("normalizeDate", () => {
  it("accepts real ISO dates only", () => {
    expect(normalizeDate("2026-02-28")).toBe("2026-02-28");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("02/03/2026")).toBeNull();
  });
});

describe("invoiceColumnsFrom", () => {
  it("builds typed invoice columns, dates at UTC midnight", () => {
    const cols = invoiceColumnsFrom({
      vendor_name: "Acme",
      invoice_number: null,
      invoice_date: "2026-11-01",
      due_date: null,
      currency: null,
      subtotal: "100",
      tax: null,
      total: "100",
    });
    expect(cols.invoiceDate?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(cols.currency).toBe("USD");
    expect(cols.totalCents).toBe(100);
    expect(cols.taxCents).toBeNull();
  });
});
