import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AllowedType } from "@/lib/upload-limits";
import { invoiceExtractionSchema, type InvoiceExtraction } from "./invoice-schema";
import { costMicros, type TokenUsage } from "./pricing";
import * as promptV1 from "./prompts/v1";

export const DEFAULT_MODEL = "claude-opus-5-5";
const prompt = promptV1;
const outputFormat = betaZodOutputFormat(invoiceExtractionSchema);

/** Everything we learn from one model call, success or not. It all goes into extraction_runs. */
export type ExtractionAttempt = {
  model: string;
  promptVersion: string;
  stopReason: string | null;
  usage: TokenUsage;
  costMicros: number;
  latencyMs: number;
} & (
  | { status: "succeeded"; data: InvoiceExtraction }
  | { status: "failed" | "refused" | "truncated"; error: string }
);

type Options = { model?: string; client?: Anthropic };

let defaultClient: Anthropic | undefined;

/**
 * Sends the invoice file to Claude and returns its answer in the shape of invoiceExtractionSchema.
 * Never throws: failures come back as an attempt with a status, so every call can be logged.
 */
export async function extractInvoice(
  file: Buffer,
  fileType: AllowedType,
  { model = process.env.EXTRACTION_MODEL || DEFAULT_MODEL, client }: Options = {},
): Promise<ExtractionAttempt> {
  const started = performance.now();
  const base = { model, promptVersion: prompt.version, stopReason: null, usage: zeroUsage(), costMicros: 0 };

  let response: Anthropic.Beta.BetaMessage;
  try {
    // Lazily created so a missing key fails this one invoice (logged, retryable), not the import.
    const anthropic = client ?? (defaultClient ??= new Anthropic());
    response = await anthropic.beta.messages.create({
      model,
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: "user", content: [fileBlock(file, fileType), { type: "text", text: prompt.userInstruction }] }],
      // Structured outputs: the answer is constrained to our JSON schema.
      output_config: { format: outputFormat, effort: "medium" },
      // If a safety classifier declines the request, the API retries it on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    return { ...base, latencyMs: elapsed(started), status: "failed", error: describeApiError(err) };
  }

  const answeredBy = response.model; // differs from `model` if a fallback model answered
  const usage = response.usage;
  const meta = {
    model: answeredBy,
    promptVersion: prompt.version,
    stopReason: response.stop_reason,
    usage,
    costMicros: costMicros(answeredBy, usage),
    latencyMs: elapsed(started),
  };

  // Read stop_reason BEFORE trusting the content: a refusal or a cut-off answer is not data.
  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "no explanation given";
    return { ...meta, status: "refused", error: `The model declined to read this document (${why}).` };
  }
  if (response.stop_reason === "max_tokens") {
    return { ...meta, status: "truncated", error: "The answer was cut off before it finished (max_tokens)." };
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { ...meta, status: "failed", error: "The model returned no text." };
  try {
    return { ...meta, status: "succeeded", data: outputFormat.parse(text) };
  } catch (err) {
    return { ...meta, status: "failed", error: `The answer didn't match the schema: ${String(err).slice(0, 500)}` };
  }
}

function fileBlock(file: Buffer, fileType: AllowedType): Anthropic.Beta.BetaContentBlockParam {
  const data = file.toString("base64");
  if (fileType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return { type: "image", source: { type: "base64", media_type: fileType, data } };
}

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key is missing or invalid (ANTHROPIC_API_KEY).";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`.trim();
  if (err instanceof Error && /api key|apiKey|authToken/i.test(err.message)) {
    return "Anthropic API key is not set (ANTHROPIC_API_KEY).";
  }
  return err instanceof Error ? err.message : String(err);
}

const zeroUsage = (): TokenUsage => ({ input_tokens: 0, output_tokens: 0 });
const elapsed = (started: number) => Math.round(performance.now() - started);
