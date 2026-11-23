"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";
import { CircleAlert, Crosshair, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PdfHighlight } from "@/components/pdf-viewer";
import { LOW_CONFIDENCE, type FieldKind, type HeaderFieldName } from "@/lib/ai/invoice-schema";
import { cn } from "@/lib/utils";
import { saveCorrections } from "./actions";

// pdf.js needs the browser (canvas, web worker), so the viewer is never server-rendered.
const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-muted" />,
});

export type ReviewField = {
  name: HeaderFieldName;
  label: string;
  kind: FieldKind;
  value: string; // current value as shown in the input (corrections win)
  aiValue: string; // what the model read, for "AI read: …" after a correction
  confidence: number | null; // null until the AI has read the invoice
  page: number | null;
  sourceText: string | null;
  corrected: boolean;
};

export type ReviewLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  confidence: number;
  page: number | null;
  sourceText: string | null;
};

const placeholders: Record<FieldKind, string> = {
  text: "",
  date: "YYYY-MM-DD",
  money: "0.00",
  currency: "USD",
};

export function ReviewWorkspace({
  invoiceId,
  fileUrl,
  fileName,
  isPdf,
  editable,
  fields,
  lines,
}: {
  invoiceId: string;
  fileUrl: string;
  fileName: string;
  isPdf: boolean;
  editable: boolean;
  fields: ReviewField[];
  lines: ReviewLine[];
}) {
  const [highlight, setHighlight] = useState<PdfHighlight>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, formAction, saving] = useActionState(saveCorrections.bind(null, invoiceId), null);

  function select(key: string, page: number | null, text: string | null) {
    setSelected(key);
    setHighlight({ page, text }); // a new object each time, so clicking again re-scrolls
  }

  // Remount the inputs whenever the saved values change, so they show what was actually stored.
  const formKey = fields.map((f) => f.value).join("|");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="h-[80vh] overflow-hidden rounded-xl border bg-muted/30 lg:sticky lg:top-4">
        {isPdf ? (
          <PdfViewer url={fileUrl} highlight={highlight} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; not for next/image
          <img src={fileUrl} alt={fileName} className="mx-auto h-full object-contain" />
        )}
      </section>

      <div className="grid content-start gap-4">
        <form key={formKey} action={formAction} className="grid gap-3 rounded-xl border p-4">
          {fields.map((f) => {
            const low = !f.corrected && f.confidence !== null && f.confidence < LOW_CONFIDENCE;
            const error = state?.fieldErrors?.[f.name];
            return (
              <div
                key={f.name}
                className={cn(
                  "grid gap-1 rounded-lg p-2 -m-1 transition-colors",
                  low && "bg-yellow-100 dark:bg-yellow-500/15",
                  selected === f.name && "ring-2 ring-yellow-500",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`field-${f.name}`} className="text-muted-foreground">
                    {f.label}
                  </Label>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {f.corrected ? (
                      <span className="flex items-center gap-1" title={`AI read: ${f.aiValue || "nothing"}`}>
                        <PencilLine className="size-3" aria-hidden /> edited
                      </span>
                    ) : f.confidence === null ? null : (
                      <span title="How sure the AI is about this value" className={cn(low && "font-medium text-yellow-800 dark:text-yellow-300")}>
                        {Math.round(f.confidence * 100)}%
                      </span>
                    )}
                    {isPdf && f.sourceText && (
                      <button
                        type="button"
                        onClick={() => select(f.name, f.page, f.sourceText)}
                        className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                        aria-label={`Show ${f.label} in the document`}
                        title="Show in document"
                      >
                        <Crosshair className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </span>
                </div>
                <Input
                  id={`field-${f.name}`}
                  name={f.name}
                  defaultValue={f.value}
                  placeholder={placeholders[f.kind]}
                  inputMode={f.kind === "money" ? "decimal" : undefined}
                  disabled={!editable}
                  aria-invalid={Boolean(error)}
                  onFocus={() => isPdf && select(f.name, f.page, f.sourceText)}
                  className="bg-background tabular-nums"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                {f.corrected && (
                  <p className="text-xs text-muted-foreground">AI read: {f.aiValue || "nothing"}</p>
                )}
              </div>
            );
          })}
          {editable && (
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save corrections"}
              </Button>
              {state && (
                <p className={cn("text-sm", state.ok ? "text-muted-foreground" : "text-destructive")} role="status">
                  {state.message}
                </p>
              )}
            </div>
          )}
        </form>

        {lines.length > 0 && (
          <div className="rounded-xl border">
            <h2 className="border-b px-4 py-2 text-sm font-medium">Line items</h2>
            <ul className="divide-y text-sm">
              {lines.map((li) => {
                const low = li.confidence < LOW_CONFIDENCE;
                return (
                  <li key={li.id}>
                    <button
                      type="button"
                      disabled={!isPdf}
                      onClick={() => select(li.id, li.page, li.sourceText ?? li.description)}
                      className={cn(
                        "grid w-full grid-cols-[1fr_auto] gap-x-3 px-4 py-2 text-left enabled:hover:bg-muted/50",
                        low && "bg-yellow-100 dark:bg-yellow-500/15",
                        selected === li.id && "ring-2 ring-inset ring-yellow-500",
                      )}
                    >
                      <span className="truncate">{li.description}</span>
                      <span className="font-medium tabular-nums">{li.amount}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {li.quantity && li.unitPrice ? `${li.quantity} × ${li.unitPrice}` : li.quantity}
                      </span>
                      <span className="text-right text-xs text-muted-foreground">
                        {low && <CircleAlert className="mr-1 inline size-3 text-yellow-700" aria-hidden />}
                        {Math.round(li.confidence * 100)}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
