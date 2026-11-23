import type { ValidationIssue } from "@/db/schema";
import { HEADER_FIELDS, type FieldKind, type HeaderFieldName, type InvoiceExtraction } from "@/lib/ai/invoice-schema";
import { formatCents, parseMoneyToCents } from "@/lib/money";

/*
 * Never trust the model blindly. This file turns Claude's answer into clean values, then checks it
 * against arithmetic that must hold on any real invoice. When a check fails, the fields involved
 * lose confidence so the review screen flags them, and the issue is shown in plain English.
 *
 * Everything here is pure (no database, no network), so it is easy to unit test.
 */

export type NormalizedField = {
  value: string | null; // text; dates as YYYY-MM-DD; money as integer cents, e.g. "123456"
  confidence: number;
  page: number | null;
  sourceText: string | null;
};

export type NormalizedLineItem = {
  position: number;
  description: string;
  quantity: string | null; // exact decimal string
  unitPriceCents: number | null;
  amountCents: number;
  confidence: number;
  page: number | null;
  sourceText: string | null;
};

export type NormalizedExtraction = {
  fields: Record<HeaderFieldName, NormalizedField>;
  lineItems: NormalizedLineItem[];
};

/** What a failed check does to confidence: always below the 0.8 review threshold. */
const FLAGGED_CONFIDENCE = 0.5;

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Rejects impossible dates like 2026-02-30, which Date would silently roll over to March.
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}

export function normalizeQuantity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/,/g, "");
  return /^-?\d+(\.\d{1,4})?$/.test(s) ? s : null;
}

/** Normalises one field value by kind. Returns null when the raw value is present but unusable. */
export function normalizeValue(kind: FieldKind, raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  switch (kind) {
    case "text":
      return raw.trim().replace(/\s+/g, " ");
    case "date":
      return normalizeDate(raw);
    case "money": {
      const cents = parseMoneyToCents(raw);
      return cents === null ? null : String(cents);
    }
    case "currency": {
      const code = raw.trim().toUpperCase();
      return /^[A-Z]{3}$/.test(code) ? code : null;
    }
  }
}

export function normalizeExtraction(data: InvoiceExtraction): NormalizedExtraction {
  const fields = {} as Record<HeaderFieldName, NormalizedField>;
  for (const { name, kind } of HEADER_FIELDS) {
    const f = data[name];
    const value = normalizeValue(kind, f.value);
    // The model gave a value we couldn't understand (e.g. "next Tuesday" as a date): keep where it
    // was read from, but empty the value and mark it as needing a human.
    const unusable = f.value !== null && f.value.trim() !== "" && value === null;
    fields[name] = {
      value,
      confidence: unusable ? 0 : clamp(f.confidence),
      page: f.page,
      sourceText: f.source_text,
    };
  }

  const lineItems = data.line_items.map((li, i): NormalizedLineItem => {
    const amountCents = parseMoneyToCents(li.amount);
    const unitPriceCents = parseMoneyToCents(li.unit_price);
    const quantity = normalizeQuantity(li.quantity);
    const unusable =
      amountCents === null ||
      (li.unit_price !== null && unitPriceCents === null) ||
      (li.quantity !== null && quantity === null);
    return {
      position: i,
      description: li.description.trim() || "(no description)",
      quantity,
      unitPriceCents,
      amountCents: amountCents ?? 0,
      confidence: unusable ? 0 : clamp(li.confidence),
      page: li.page,
      sourceText: li.source_text,
    };
  });

  return { fields, lineItems };
}

/** The values the checks need, taken from fields (model values or a human's corrections). */
export type CheckInput = {
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string;
  lineItems: Pick<NormalizedLineItem, "quantity" | "unitPriceCents" | "amountCents">[];
};

/** qty × unit price in cents, exactly (quantity has up to 4 decimals), rounded to the nearest cent. */
export function lineExtensionCents(quantity: string, unitPriceCents: number): number {
  const [whole, frac = ""] = quantity.replace("-", "").split(".");
  const scaled = BigInt(whole + frac.padEnd(4, "0")) * BigInt(Math.abs(unitPriceCents)); // |qty| × 10^4 × |cents|
  const rounded = Number((scaled + BigInt(5_000)) / BigInt(10_000)); // round half away from zero
  const negative = quantity.startsWith("-") !== unitPriceCents < 0;
  return negative && rounded !== 0 ? -rounded : rounded;
}

export function checkInvoice(input: CheckInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const money = (c: number) => formatCents(c, input.currency);
  const { subtotalCents: subtotal, taxCents: tax, totalCents: total } = input;

  if (total === null) {
    issues.push({ code: "missing_total", message: "No total amount was found.", fields: ["total"] });
  }

  if (subtotal !== null && total !== null && subtotal + (tax ?? 0) !== total) {
    issues.push({
      code: "totals_mismatch",
      message: `Subtotal ${money(subtotal)} + tax ${money(tax ?? 0)} = ${money(subtotal + (tax ?? 0))}, but the total is ${money(total)}. (Shipping, fees or discounts can cause this.)`,
      fields: ["subtotal", "tax", "total"],
    });
  }

  if (input.lineItems.length > 0) {
    const sum = input.lineItems.reduce((acc, li) => acc + li.amountCents, 0);
    // Compare to the subtotal if there is one; otherwise to the total before tax.
    const expected = subtotal ?? (total !== null ? total - (tax ?? 0) : null);
    if (expected !== null && sum !== expected) {
      issues.push({
        code: "line_items_mismatch",
        message: `Line items add up to ${money(sum)}, but the ${subtotal !== null ? "subtotal" : "total before tax"} is ${money(expected)}.`,
        fields: ["line_items", subtotal !== null ? "subtotal" : "total"],
      });
    }
  }

  input.lineItems.forEach((li, i) => {
    if (li.quantity === null || li.unitPriceCents === null) return;
    const extended = lineExtensionCents(li.quantity, li.unitPriceCents);
    if (Math.abs(extended - li.amountCents) > 1) {
      issues.push({
        code: "line_amount_mismatch",
        message: `Line ${i + 1}: ${li.quantity} × ${money(li.unitPriceCents)} = ${money(extended)}, but the line says ${money(li.amountCents)}.`,
        fields: [`line_items.${i}`],
      });
    }
  });

  if (input.invoiceDate && input.dueDate && input.dueDate < input.invoiceDate) {
    issues.push({
      code: "due_before_invoice",
      message: `The due date (${input.dueDate}) is before the invoice date (${input.invoiceDate}).`,
      fields: ["invoice_date", "due_date"],
    });
  }

  return issues;
}

const centsOf = (f: NormalizedField) => (f.value === null ? null : Number(f.value));

export function checkInputFrom(n: NormalizedExtraction): CheckInput {
  return {
    subtotalCents: centsOf(n.fields.subtotal),
    taxCents: centsOf(n.fields.tax),
    totalCents: centsOf(n.fields.total),
    invoiceDate: n.fields.invoice_date.value,
    dueDate: n.fields.due_date.value,
    currency: n.fields.currency.value ?? "USD",
    lineItems: n.lineItems,
  };
}

/**
 * The invoices table keeps a typed copy of the current header values (corrections win over the
 * model) so lists, sorting and later matching don't need to join invoice_fields.
 */
export function invoiceColumnsFrom(values: Record<HeaderFieldName, string | null>) {
  const date = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
  const cents = (v: string | null) => (v === null ? null : Number(v));
  return {
    vendorName: values.vendor_name,
    invoiceNumber: values.invoice_number,
    invoiceDate: date(values.invoice_date),
    dueDate: date(values.due_date),
    currency: values.currency ?? "USD",
    subtotalCents: cents(values.subtotal),
    taxCents: cents(values.tax),
    totalCents: cents(values.total),
  };
}

/** Lowers the confidence of every field involved in a failed check, so the reviewer looks at it. */
export function applyIssues(n: NormalizedExtraction, issues: ValidationIssue[]): NormalizedExtraction {
  const flagged = new Set(issues.flatMap((i) => i.fields));
  const cap = (c: number, hit: boolean) => (hit ? Math.min(c, FLAGGED_CONFIDENCE) : c);
  const fields = Object.fromEntries(
    Object.entries(n.fields).map(([name, f]) => [name, { ...f, confidence: cap(f.confidence, flagged.has(name)) }]),
  ) as NormalizedExtraction["fields"];
  const lineItems = n.lineItems.map((li, i) => ({
    ...li,
    confidence: cap(li.confidence, flagged.has("line_items") || flagged.has(`line_items.${i}`)),
  }));
  return { fields, lineItems };
}

/** The whole post-model step: normalise, check, and flag. */
export function validateExtraction(data: InvoiceExtraction) {
  const normalized = normalizeExtraction(data);
  const issues = checkInvoice(checkInputFrom(normalized));
  if (!data.is_invoice) {
    issues.unshift({
      code: "not_an_invoice",
      message: "This document doesn't look like an invoice.",
      fields: HEADER_FIELDS.map((f) => f.name),
    });
  }
  return { ...applyIssues(normalized, issues), issues };
}
