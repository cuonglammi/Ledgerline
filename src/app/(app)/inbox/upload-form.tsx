"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Copy, Upload } from "lucide-react";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { cn } from "@/lib/utils";
import { uploadInvoice, type UploadResult } from "./actions";

const accept = Object.keys(ALLOWED_TYPES).join(",");

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [pending, startTransition] = useTransition();

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    startTransition(async () => {
      const done: UploadResult[] = [];
      // One request per file keeps each one under the size limit and lets one bad file fail alone.
      for (const file of list) {
        if (file.size > MAX_UPLOAD_BYTES) {
          done.push({ ok: false, error: "Files must be 4 MB or smaller.", fileName: file.name });
          continue;
        }
        const data = new FormData();
        data.set("file", file);
        try {
          done.push(await uploadInvoice(data));
        } catch {
          done.push({ ok: false, error: "Upload failed. Please try again.", fileName: file.name });
        }
      }
      setResults(done);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="grid gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-muted" : "hover:bg-muted/50",
          pending && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{pending ? "Uploading…" : "Drop invoices here or click to choose"}</span>
        <span className="text-xs text-muted-foreground">PDF, PNG, JPEG or WebP · up to 4 MB each</span>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
        />
      </label>

      {results.length > 0 && (
        <ul className="grid gap-1 text-sm" aria-live="polite">
          {results.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              {!r.ok ? (
                <CircleAlert className="size-4 text-destructive" aria-hidden />
              ) : r.duplicate ? (
                <Copy className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              )}
              <span className="truncate font-medium">{r.fileName}</span>
              <span className="text-muted-foreground">
                {!r.ok ? (
                  r.error
                ) : r.duplicate ? (
                  <>
                    already uploaded,{" "}
                    <Link href={`/invoices/${r.invoiceId}`} className="underline underline-offset-4">
                      open it
                    </Link>
                  </>
                ) : (
                  "uploaded"
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
