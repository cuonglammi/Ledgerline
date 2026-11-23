import { z } from "zod";

/**
 * The contract with the model: Claude's answer is constrained to exactly this shape (structured
 * outputs), and the SDK parses it back into these types.
 *
 * Every value comes with evidence: how sure the model is, which page it's on, and the exact text it
 * read. The review screen uses `source_text` to highlight the value in the PDF, and anything under
 * 0.8 confidence is flagged for a human.
 *
 * Money is a decimal *string* ("1234.56") copied from the page, not a number: we convert it to
 * integer cents ourselves (src/lib/money.ts) so no float ever touches an amount.
 *
 * No min/max constraints on purpose: structured outputs can't enforce them server-side, so the SDK
 * would only check them afterwards and throw away an otherwise good answer. We clamp instead.
 */
const evidence = {
  confidence: z.number().describe("0 to 1. Your honest probability that the value is exactly right."),
  page: z.number().int().nullable().describe("1-based page number the value was read from."),
  source_text: z
    .string()
    .nullable()
    .describe("The exact characters on the page the value was read from, copied verbatim (no reformatting)."),
};

const textField = z.object({
  value: z.string().nullable().describe("null if the invoice doesn't show it."),
  ...evidence,
});

const dateField = z.object({
  value: z.string().nullable().describe("ISO date YYYY-MM-DD, or null if the invoice doesn't show it."),
  ...evidence,
});

const moneyField = z.object({
  value: z
    .string()
    .nullable()
    .describe('Plain decimal with a dot, no currency symbol or thousands separator, e.g. "1234.50". Negative for credits.'),
  ...evidence,
});

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.string().nullable().describe('Plain decimal, e.g. "3" or "2.5". null if not shown.'),
  unit_price: z.string().nullable().describe('Plain decimal, e.g. "19.99". null if not shown.'),
  amount: z.string().describe('The line total as printed, plain decimal, e.g. "59.97".'),
  ...evidence,
});

export const invoiceExtractionSchema = z.object({
  is_invoice: z.boolean().describe("false if the document is not an invoice or bill."),
  vendor_name: textField.describe("The company that issued the invoice and should be paid (not the customer)."),
  invoice_number: textField,
  invoice_date: dateField,
  due_date: dateField.describe("If only payment terms are given (e.g. Net 30), compute it from the invoice date."),
  currency: textField.describe("ISO 4217 code such as USD, EUR, GBP."),
  subtotal: moneyField.describe("Total before tax."),
  tax: moneyField.describe("Total tax (sum all tax lines). null if no tax is shown."),
  total: moneyField.describe("The final amount due."),
  line_items: z.array(lineItemSchema),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;

/** Header fields in the order the review screen shows them, and how each value is normalised. */
export const HEADER_FIELDS = [
  { name: "vendor_name", label: "Vendor", kind: "text" },
  { name: "invoice_number", label: "Invoice #", kind: "text" },
  { name: "invoice_date", label: "Invoice date", kind: "date" },
  { name: "due_date", label: "Due date", kind: "date" },
  { name: "currency", label: "Currency", kind: "currency" },
  { name: "subtotal", label: "Subtotal", kind: "money" },
  { name: "tax", label: "Tax", kind: "money" },
  { name: "total", label: "Total", kind: "money" },
] as const;

export type HeaderFieldName = (typeof HEADER_FIELDS)[number]["name"];
export type FieldKind = (typeof HEADER_FIELDS)[number]["kind"];

/** Below this, a field is highlighted for review. */
export const LOW_CONFIDENCE = 0.8;
