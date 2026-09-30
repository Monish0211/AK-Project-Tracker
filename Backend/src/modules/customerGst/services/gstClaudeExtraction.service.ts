import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import type { GstDocumentKind } from "./gstFileValidation.service.js";

/**
 * Server-side-only Anthropic Claude client for GST document extraction.
 * Deliberately a SEPARATE small client/singleton from pdfImport's
 * claudeExtraction.service.ts rather than importing/modifying that file —
 * pdfImport is an existing, unrelated, already-working feature and this
 * task's own constraints call for touching only files genuinely required
 * for the GST feature. Both modules read the same ANTHROPIC_API_KEY/
 * CLAUDE_MODEL from Backend/.env; nothing here is a second AI vendor or a
 * second processing stack, just a second (small, ~15-line) instantiation of
 * the same SDK client, isolating this feature's blast radius from pdfImport's.
 *
 * Same feature-disable/rollback mechanism as pdfImport: unset either env
 * var and isGstClaudeConfigured() returns false, so getGstClient() throws a
 * clean 503 — requires a backend restart to take effect (env.ts parses
 * process.env once at module load, same as every other env-gated feature).
 */
export function isGstClaudeConfigured(): boolean {
  return !!(env.ANTHROPIC_API_KEY && env.CLAUDE_MODEL);
}

let client: Anthropic | null = null;

function getGstClient(): Anthropic {
  if (!isGstClaudeConfigured()) {
    throw new AppError("Claude AI-assist is not configured (ANTHROPIC_API_KEY/CLAUDE_MODEL).", 503);
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }
  return client;
}

const MEDIA_TYPE_BY_KIND: Record<GstDocumentKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
};

/**
 * Explicitly instructs Claude to extract only what the document prints, and
 * explicitly NOT to assess or claim validity/registration status — the
 * conceptual separation between "extraction" and "verification" the audit
 * calls out is enforced at the prompt level here, on top of the fact that
 * the output shape (gstClaudeResponse.validators.ts) has no field for it at
 * all downstream.
 */
function buildGstExtractionPrompt(): string {
  return `You are extracting candidate field values from an uploaded GST (Goods and Services Tax) registration certificate/document for a customer master form. Read the entire document, including scanned/image pages.

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape — every field is optional; use null for anything not clearly printed on the document, never guess or fabricate a value:

{
  "gstNumber": string|null,
  "legalName": string|null,
  "tradeName": string|null,
  "state": string|null
}

"gstNumber" is the GSTIN printed on the certificate. "legalName" is the registered legal name of the business. "tradeName" is the trade/brand name if shown (often different from the legal name). "state" is the state/place of registration if reliably shown.

Do NOT state or imply whether the GSTIN is currently valid, active, or registered — you are only reading what is printed on this one document, not checking it against anything. Do not add any field other than the four listed above.`;
}

export interface GstClaudeExtractionResult {
  /** Claude's raw text response — NOT yet parsed/validated. See gstClaudeResponse.validators.ts. */
  rawText: string;
}

export async function extractGstViaClaudeApi(buffer: Buffer, kind: GstDocumentKind): Promise<GstClaudeExtractionResult> {
  const anthropic = getGstClient();

  const contentBlock =
    kind === "pdf"
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: buffer.toString("base64") },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: MEDIA_TYPE_BY_KIND[kind] as "image/png" | "image/jpeg",
            data: buffer.toString("base64"),
          },
        };

  let response;
  try {
    response = await anthropic.messages.create(
      {
        model: env.CLAUDE_MODEL!,
        max_tokens: 1024,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: buildGstExtractionPrompt() }] }],
      },
      { timeout: env.CLAUDE_REQUEST_TIMEOUT_MS }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    throw new AppError(`GST extraction request failed: ${message}`, 502);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AppError("Claude returned no text content.", 502);
  }

  return { rawText: textBlock.text };
}
