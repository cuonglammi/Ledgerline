/**
 * List prices in US dollars per million tokens (Anthropic API pricing, Nov 2026).
 * $X per million tokens is exactly X millionths of a dollar per token, which is why costs are kept
 * in "micros": integer maths, no rounding until display.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Cost of one call in millionths of a dollar. An unknown model costs 0 rather than failing the pipeline. */
export function costMicros(model: string, usage: TokenUsage): number {
  const p = PRICES[model];
  if (!p) return 0;
  return Math.round(
    usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite,
  );
}

export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
