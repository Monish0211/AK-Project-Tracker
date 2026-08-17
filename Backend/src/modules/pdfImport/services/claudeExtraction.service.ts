import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";

/**
 * Server-side-only Anthropic Claude client — sends the RAW PDF (per the
 * approved Stage 3 architecture: scanned/unstructured PDFs need
 * document-level understanding a text-only call would miss) and asks for
 * structured JSON candidate data. Never runs in, or is reachable from, the
 * frontend; the API key comes only from Backend/.env (never source, never
 * committed — see .env.example), matching graphAuth.service.ts's exact
 * treatment of the Microsoft Graph client secret.
 *
 * Claude is a sensor, not a decision-maker: this service returns raw text
 * only. It never validates, never enum-checks, never calculates, never
 * persists — see claudeResponse.validators.ts / enumOptions.ts /
 * pdfImportResponseAdapter.service.ts for everything downstream of this.
 *
 * CLAUDE_MODEL is required (in addition to ANTHROPIC_API_KEY) for
 * isClaudeConfigured() to return true — no model identifier is hardcoded
 * or guessed here; which model to call is an operational decision made via
 * Backend/.env, not an assumption baked into source.
 *
 * NOT YET VERIFIED against the real Anthropic API — no live call has been
 * made during this implementation pass, per explicit instruction. This is
 * a correct, standard Anthropic SDK document-input implementation, but
 * "correct in principle" and "proven against the real API" are different
 * claims.
 */

/**
 * Feature-disable / rollback mechanism: unset ANTHROPIC_API_KEY (and/or
 * CLAUDE_MODEL) in Backend/.env and this returns false, so getClient()
 * throws a clean 503 and every caller (the frontend's own try/catch in
 * pdfImportService.ts) falls back to the rule-engine-only result — no code
 * change or redeploy needed to disable this feature.
 *
 * IMPORTANT — this requires a BACKEND RESTART to take effect. env.ts reads
 * and validates process.env exactly once, at module load
 * (`envSchema.safeParse(process.env)`), and there is no re-read mechanism
 * anywhere in this codebase (confirmed — every other env-gated feature,
 * Graph/KEKA/SMTP, behaves identically). Editing Backend/.env on a live,
 * running process does nothing until the process restarts. This is NOT a
 * zero-downtime, hot-reload kill-switch — the operational runbook is:
 * edit .env, then restart the backend process.
 */
export function isClaudeConfigured(): boolean {
  return !!(env.ANTHROPIC_API_KEY && env.CLAUDE_MODEL);
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!isClaudeConfigured()) {
    throw new AppError("Claude AI-assist is not configured (ANTHROPIC_API_KEY/CLAUDE_MODEL).", 503);
  }

  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }

  return client;
}

/**
 * The exact instruction given to Claude — asks for JSON only, matching the
 * field names claudeResponse.validators.ts's schema expects. Claude is
 * told explicitly not to compute anything and not to invent enum values,
 * mirroring the approved architecture's "document understanding and
 * candidate extraction only" boundary (Stage 3 §7) at the prompt level,
 * even though the real enforcement happens downstream in validation.
 */
const EXTRACTION_PROMPT = `You are extracting candidate field values from a project-related PDF (a work order, purchase order, or similar commercial document) for a project management form. Read the entire document, including any scanned/image pages.

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape — every field is optional; use null for anything not found, never guess or fabricate a value:

{
  "generalInformation": {
    "poMonth": string|null, "prCategory": string|null, "projectTitle": string|null, "client": string|null,
    "department": string|null, "domesticForeign": string|null, "workOrderStatus": string|null, "projectStatus": string|null,
    "projectStartDate": string|null, "projectEndDate": string|null, "estimatedDuration": number|null, "durationUnit": string|null,
    "workOrderNumber": string|null, "workOrderDate": string|null, "eicName": string|null, "contactNumber": string|null,
    "emailId": string|null, "contractType": string|null, "pmoCoordinator": string|null, "workOrderValue": number|null, "currency": string|null
  },
  "quantity": [ { "description": string|null, "qty": number|null, "uom": string|null, "unitRate": number|null } ],
  "paymentMilestones": [ { "milestoneName": string|null, "paymentPercentage": number|null, "dueDate": string|null } ]
}

Do not calculate pending quantities, pending amounts, totals, or currency conversions — return only the raw values as they appear in the document. Do not invent a PO/PR number if none is visible. If department, currency, or any other categorical field is genuinely ambiguous, return your best literal reading of the document text rather than a category you are unsure applies.`;

export interface ClaudeExtractionResult {
  /** Claude's raw text response — NOT yet parsed/validated. See claudeResponse.validators.ts. */
  rawText: string;
}

export async function extractViaClaudeApi(pdfBuffer: Buffer, fileName: string): Promise<ClaudeExtractionResult> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create(
      {
        model: env.CLAUDE_MODEL!,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBuffer.toString("base64"),
                },
                title: fileName,
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      },
      { timeout: env.CLAUDE_REQUEST_TIMEOUT_MS }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    throw new AppError(`Claude extraction request failed: ${message}`, 502);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AppError("Claude returned no text content.", 502);
  }

  return { rawText: textBlock.text };
}
