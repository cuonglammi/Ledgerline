/**
 * Finds which text items on a PDF page contain `needle` (the model's `source_text`).
 *
 * pdf.js splits a page into many small text items ("Total", "Due:", "$1,234.56"), and one value can
 * span several of them. So we join the items into one string, search that, and return the index of
 * every item the match overlaps. The text layer then wraps those items in <mark>.
 *
 * Matching ignores case and whitespace first; if that fails it also ignores punctuation, because the
 * model sometimes drops a "$" or a comma that the PDF has.
 */
export function findHighlightedItems(items: readonly string[], needle: string | null | undefined): Set<number> {
  if (!needle) return new Set();
  const strategies = [
    (s: string) => s.toLowerCase().replace(/\s+/g, ""),
    (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""),
  ];
  for (const normalize of strategies) {
    const target = normalize(needle);
    if (target.length < 2) continue; // a single character would match everywhere
    const starts: number[] = [];
    let joined = "";
    for (const item of items) {
      starts.push(joined.length);
      joined += normalize(item);
    }
    const at = joined.indexOf(target);
    if (at === -1) continue;
    const end = at + target.length;
    const hits = new Set<number>();
    items.forEach((_, i) => {
      const itemStart = starts[i];
      const itemEnd = i + 1 < starts.length ? starts[i + 1] : joined.length;
      if (itemEnd > itemStart && itemStart < end && itemEnd > at) hits.add(i);
    });
    return hits;
  }
  return new Set();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
