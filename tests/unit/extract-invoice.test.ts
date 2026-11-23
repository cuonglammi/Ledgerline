import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { extractInvoice } from "@/lib/ai/extract-invoice";

const pdf = Buffer.from("%PDF-1.7 test");
const usage = { input_tokens: 2000, output_tokens: 500 };

/** A stand-in for the Anthropic client that returns a canned response and records the request. */
function fakeClient(response: Partial<Anthropic.Beta.BetaMessage> | Error) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          calls.push(params);
          if (response instanceof Error) throw response;
          return { model: "claude-opus-5-5", usage, stop_details: null, content: [], ...response };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const validAnswer = JSON.stringify({
  is_invoice: true,
  vendor_name: { value: "Acme", confidence: 0.9, page: 1, source_text: "Acme" },
  invoice_number: { value: "1", confidence: 0.9, page: 1, source_text: "1" },
  invoice_date: { value: "2026-11-01", confidence: 0.9, page: 1, source_text: "Nov 1, 2026" },
  due_date: { value: null, confidence: 0.9, page: null, source_text: null },
  currency: { value: "USD", confidence: 0.9, page: 1, source_text: "$" },
  subtotal: { value: "10.00", confidence: 0.9, page: 1, source_text: "10.00" },
  tax: { value: null, confidence: 0.9, page: null, source_text: null },
  total: { value: "10.00", confidence: 0.9, page: 1, source_text: "10.00" },
  line_items: [],
});

describe("extractInvoice", () => {
  it("sends the PDF as a document block with a structured-output schema, and logs cost", async () => {
    const { client, calls } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: validAnswer, citations: null }] });
    const result = await extractInvoice(pdf, "application/pdf", { client });

    expect(result.status).toBe("succeeded");
    if (result.status === "succeeded") expect(result.data.vendor_name.value).toBe("Acme");
    expect(result.costMicros).toBe(2000 * 4 + 500 * 20); // $4 / $20 per million tokens
    expect(result.promptVersion).toBe("v1");

    const params = calls[0] as { model: string; messages: { content: { type: string }[] }[]; output_config: { format: { type: string } } };
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.messages[0].content[0].type).toBe("document");
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("sends images as image blocks", async () => {
    const { client, calls } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: validAnswer, citations: null }] });
    await extractInvoice(pdf, "image/png", { client });
    expect((calls[0] as { messages: { content: { type: string }[] }[] }).messages[0].content[0].type).toBe("image");
  });

  it("checks stop_reason before trusting the content", async () => {
    const refused = await extractInvoice(pdf, "application/pdf", {
      client: fakeClient({ stop_reason: "refusal", content: [{ type: "text", text: validAnswer, citations: null }] }).client,
    });
    expect(refused.status).toBe("refused");

    const truncated = await extractInvoice(pdf, "application/pdf", {
      client: fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: validAnswer.slice(0, 40), citations: null }] }).client,
    });
    expect(truncated.status).toBe("truncated");
    expect(truncated.usage.output_tokens).toBe(500); // tokens are still logged
  });

  it("reports output that doesn't match the schema as a failure", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: '{"is_invoice": "yes"}', citations: null }] });
    const result = await extractInvoice(pdf, "application/pdf", { client });
    expect(result.status).toBe("failed");
  });

  it("never throws on API errors", async () => {
    const { client } = fakeClient(new Error("socket hang up"));
    const result = await extractInvoice(pdf, "application/pdf", { client });
    expect(result).toMatchObject({ status: "failed", error: "socket hang up", costMicros: 0 });
  });
});
