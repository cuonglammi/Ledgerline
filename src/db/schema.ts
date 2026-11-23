import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

/**
 * Every state an invoice can be in. See docs/BUILD_PLAN.md → "Invoice status machine".
 * Week 2 uses received → extracting → needs_review (or failed); later weeks add the rest.
 */
export const invoiceStatus = pgEnum("invoice_status", [
  "received",
  "extracting",
  "needs_review",
  "matching",
  "pending_approval",
  "approved",
  "exported",
  "rejected",
  "failed",
]);

export const invoiceSource = pgEnum("invoice_source", ["upload", "email"]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Every business table carries org_id: this is what keeps one company's data away from another's.
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    status: invoiceStatus("status").notNull().default("received"),
    source: invoiceSource("source").notNull().default("upload"),

    // The original file
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: text("file_hash").notNull(), // SHA-256, used to stop the same file being processed twice

    // Filled in by AI extraction (Week 2). Money is always stored as integer cents.
    vendorName: text("vendor_name"),
    invoiceNumber: text("invoice_number"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }),
    taxCents: bigint("tax_cents", { mode: "number" }),
    totalCents: bigint("total_cents", { mode: "number" }),
    currency: text("currency").notNull().default("USD"),

    // Problems found by checking the model's answer (e.g. line items don't add up to the total).
    validationIssues: jsonb("validation_issues").$type<ValidationIssue[]>().notNull().default([]),
    // Why the last extraction failed, shown on the review screen with a retry button.
    extractionError: text("extraction_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("invoices_org_created_idx").on(t.orgId, t.createdAt),
    uniqueIndex("invoices_org_file_hash_idx").on(t.orgId, t.fileHash),
  ],
);

/** A check on the model's output that failed. Kept on the invoice so the review screen can explain it. */
export type ValidationIssue = {
  code:
    | "not_an_invoice"
    | "totals_mismatch"
    |"line_items_mismatch" | "line_amount_mismatch" | "due_before_invoice" | "missing_total";
  message: string;
  fields: string[]; // field names (or "line_items") whose confidence was lowered because of this
};

/**
 * One row per header field the AI read (vendor_name, invoice_number, total, ...).
 * `value` is what the model said, normalised to text: dates as YYYY-MM-DD, money as integer cents.
 * `corrected_value` is what a human changed it to. Every correction is free eval data (Week 3).
 */
export const invoiceFields = pgTable(
  "invoice_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    value: text("value"),
    confidence: real("confidence").notNull(), // 0-1, after our own validation has had its say
    page: integer("page"), // 1-based page the value was read from
    sourceText: text("source_text"), // the exact text on the page, used to highlight it in the PDF
    correctedValue: text("corrected_value"),
    correctedBy: text("corrected_by").references(() => user.id, { onDelete: "set null" }),
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("invoice_fields_invoice_field_idx").on(t.invoiceId, t.fieldName)],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    // Quantities can be fractional (2.5 hours), so they're an exact decimal, never a float.
    quantity: numeric("quantity", { precision: 14, scale: 4 }),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    confidence: real("confidence").notNull(),
    page: integer("page"),
    sourceText: text("source_text"),
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoiceId, t.position)],
);

export const extractionRunStatus = pgEnum("extraction_run_status", [
  "succeeded",
  "failed", // API or network error, or the output didn't parse
  "refused", // stop_reason "refusal"
  "truncated", // stop_reason "max_tokens": the JSON was cut off
]);

/**
 * One row per call to the model, successful or not. This table is where the resume numbers come from:
 * cost per invoice, latency, failure rate, and how they change between prompt versions and models.
 */
export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    model: text("model").notNull(), // the model that actually answered (can differ if a fallback ran)
    promptVersion: text("prompt_version").notNull(),
    status: extractionRunStatus("status").notNull(),
    stopReason: text("stop_reason"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    // Cost in millionths of a dollar: one invoice costs ~1 cent, so whole cents would round most runs to 0 or 1.
    costMicros: integer("cost_micros").notNull().default(0),
    latencyMs: integer("latency_ms").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extraction_runs_invoice_idx").on(t.invoiceId, t.createdAt),
    index("extraction_runs_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceField = typeof invoiceFields.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type ExtractionRun = typeof extractionRuns.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
