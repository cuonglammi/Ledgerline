CREATE TYPE "public"."extraction_run_status" AS ENUM('succeeded', 'failed', 'refused', 'truncated');--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" "extraction_run_status" NOT NULL,
	"stop_reason" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"value" text,
	"confidence" real NOT NULL,
	"page" integer,
	"source_text" text,
	"corrected_value" text,
	"corrected_by" text,
	"corrected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 4),
	"unit_price_cents" bigint,
	"amount_cents" bigint NOT NULL,
	"confidence" real NOT NULL,
	"page" integer,
	"source_text" text
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "validation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_fields" ADD CONSTRAINT "invoice_fields_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_fields" ADD CONSTRAINT "invoice_fields_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_fields" ADD CONSTRAINT "invoice_fields_corrected_by_user_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_runs_invoice_idx" ON "extraction_runs" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "extraction_runs_org_created_idx" ON "extraction_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_fields_invoice_field_idx" ON "invoice_fields" USING btree ("invoice_id","field_name");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id","position");