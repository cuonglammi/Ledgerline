import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export * from "./auth-schema";

/**
 * Every state an invoice can be in. See docs/BUILD_PLAN.md → "Invoice status machine".
 * Week 1 only uses `received`; later weeks move invoices through the rest.
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

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
