"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { escapeHtml, findHighlightedItems } from "@/lib/pdf-highlight";

// Must be set in the same module that renders <Document> (see react-pdf's README).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type PdfHighlight = { page: number | null; text: string | null } | null;

/**
 * Renders every page of the PDF with a selectable text layer. When `highlight` is set, the text
 * items matching `highlight.text` are wrapped in <mark> and scrolled into view.
 */
export default function PdfViewer({ url, highlight }: { url: string; highlight: PdfHighlight }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [numPages, setNumPages] = useState(0);
  // The text items of each page, as pdf.js extracted them (filled in as pages render).
  const [pageItems, setPageItems] = useState<Record<number, string[]>>({});

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Which items to mark on which page. Search the page the model named first, then every other page
  // (models are occasionally off by one on page numbers).
  const marks = useMemo(() => {
    const result: Record<number, Set<number>> = {};
    if (!highlight?.text) return result;
    const order = Object.keys(pageItems)
      .map(Number)
      .sort((a, b) => (a === highlight.page ? -1 : b === highlight.page ? 1 : a - b));
    for (const page of order) {
      const hits = findHighlightedItems(pageItems[page], highlight.text);
      if (hits.size > 0) {
        result[page] = hits;
        break;
      }
    }
    return result;
  }, [highlight, pageItems]);

  const markedPage = Number(Object.keys(marks)[0]) || null;
  const allPagesLoaded = numPages > 0 && Object.keys(pageItems).length === numPages;
  const notFound = Boolean(highlight?.text) && allPagesLoaded && markedPage === null;

  useEffect(() => {
    if (!highlight) return;
    const target = markedPage ?? highlight.page;
    if (!target) return;
    // Wait a frame so the text layer has re-rendered with the new <mark> elements.
    const id = requestAnimationFrame(() => {
      const pageEl = containerRef.current?.querySelector(`[data-page="${target}"]`);
      const mark = pageEl?.querySelector("mark");
      (mark ?? pageEl)?.scrollIntoView({ behavior: "smooth", block: mark ? "center" : "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [highlight, markedPage]);

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto">
      {notFound && (
        <p className="sticky top-2 z-10 mx-auto w-fit rounded-md bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow">
          Couldn&apos;t find &ldquo;{highlight?.text}&rdquo; in the PDF text (it may be a scanned image).
        </p>
      )}
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div className="h-[75vh] animate-pulse bg-muted" />}
        error={<p className="p-6 text-sm text-destructive">This PDF couldn&apos;t be displayed.</p>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => (
          <div key={page} data-page={page} className="border-b last:border-b-0">
            <Page
              pageNumber={page}
              width={width}
              renderAnnotationLayer={false}
              onGetTextSuccess={({ items }) =>
                setPageItems((prev) => ({ ...prev, [page]: items.map((it) => ("str" in it ? it.str : "")) }))
              }
              customTextRenderer={({ str, itemIndex }) =>
                marks[page]?.has(itemIndex)
                  ? `<mark class="rounded-sm bg-yellow-300/70 text-transparent ring-2 ring-yellow-500">${escapeHtml(str)}</mark>`
                  : escapeHtml(str)
              }
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
