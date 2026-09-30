import { z } from "zod";

/**
 * Validates Claude's raw text response for GST extraction. Same partial-
 * tolerance shape as pdfImport's claudeResponse.validators.ts: every field
 * is individually .nullable().optional(), so a document where Claude found
 * only some values (e.g. GSTIN but no readable state) still parses
 * successfully — that is normal, expected candidate data with gaps, not an
 * error. A response that isn't valid JSON, or isn't even this shape at all,
 * is a DIFFERENT, total failure — see parseGstClaudeResponse()'s return
 * shape below.
 */

const nullableString = () => z.string().nullable().optional();

export const gstClaudeExtractionSchema = z.object({
  gstNumber: nullableString(),
  legalName: nullableString(),
  tradeName: nullableString(),
  state: nullableString(),
});

export type GstClaudeExtractionResult = z.infer<typeof gstClaudeExtractionSchema>;

export interface ParsedGstClaudeResponse {
  ok: boolean;
  data?: GstClaudeExtractionResult;
  /** Set only when ok=false — a TOTAL failure (bad JSON or wrong shape), never for "some fields were null." */
  failureReason?: string;
}

export function parseGstClaudeResponse(rawText: string): ParsedGstClaudeResponse {
  let json: unknown;
  try {
    // Claude occasionally wraps JSON in markdown fences despite the prompt
    // asking it not to — strip defensively, same as pdfImport's parser.
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, failureReason: "Claude response was not valid JSON." };
  }

  const result = gstClaudeExtractionSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, failureReason: "Claude response did not match the expected structure." };
  }

  return { ok: true, data: result.data };
}
