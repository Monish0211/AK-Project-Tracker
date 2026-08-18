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
 *
 * One unified prompt handles both one document and a multi-document set —
 * a single document naturally has nothing to cross-check, so
 * fieldSources/conflicts degrade to "one source, no conflicts" on their
 * own without a separate single-file prompt to maintain.
 */
function buildExtractionPrompt(documentNames: string[]): string {
  const documentDescription =
    documentNames.length === 1
      ? `a project-related PDF (${documentNames[0]} — a work order, purchase order, or similar commercial document)`
      : `a SET of ${documentNames.length} project-related PDFs belonging to the same project/document package (${documentNames.join(", ")} — work orders, purchase orders, quotations, LOAs, or similar commercial documents)`;

  const crossCheckInstructions =
    documentNames.length === 1
      ? ""
      : `

These documents describe the SAME project — treat them as one document set, not independent files:
- A field present in only one document: use that value.
- A field present in multiple documents that AGREE (same value): use that value once.
- A field present in multiple documents that DISAGREE (different values): do NOT pick one silently. Instead leave "generalInformation" for that field set to whichever value you consider most likely, but ALSO add an entry to "conflicts" (see shape below) listing every distinct value and which document it came from. Never fabricate a resolution.
- Also return "fieldSources": for every generalInformation field you found a value for, list the exact document name(s) (from: ${documentNames.join(", ")}) that value came from.`;

  return `You are extracting candidate field values from ${documentDescription} for a project management form. Read every page of every document provided, including any scanned/image pages.${crossCheckInstructions}

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
  "paymentMilestones": [ { "milestoneName": string|null, "paymentPercentage": number|null, "dueDate": string|null } ],
  "fieldSources": { "<generalInformation field name>": ["<document name>", ...] },
  "conflicts": [ { "field": "<generalInformation field name>", "values": [ { "documentName": string, "value": string|number|null } ] } ]
}

Do not calculate pending quantities, pending amounts, totals, or currency conversions — return only the raw values as they appear in the document(s). Do not invent a PO/PR number if none is visible. If department, currency, or any other categorical field is genuinely ambiguous, return your best literal reading of the document text rather than a category you are unsure applies. Omit "fieldSources"/"conflicts" entirely (or leave them empty) for a single document with nothing to cross-check.`;
}

export interface ClaudeExtractionResult {
  /** Claude's raw text response — NOT yet parsed/validated. See claudeResponse.validators.ts. */
  rawText: string;
}

export interface ClaudeSourceDocument {
  buffer: Buffer;
  fileName: string;
}

/**
 * Multi-document cross-verification — sends every document in `documents`
 * as its own `type: "document"` content block within ONE Anthropic
 * request, so Claude can read and reason across all of them together
 * (Option A: one request for the whole set, not N independent calls plus
 * a separate merge call — see the approved cost/architecture reasoning).
 * A single-element array is the exact same code path as the original
 * single-file behavior; nothing here special-cases "only one document."
 */
export async function extractViaClaudeApi(documents: ClaudeSourceDocument[]): Promise<ClaudeExtractionResult> {
  const anthropic = getClient();

  const documentNames = documents.map((d) => d.fileName);
  const documentBlocks = documents.map((d) => ({
    type: "document" as const,
    source: {
      type: "base64" as const,
      media_type: "application/pdf" as const,
      data: d.buffer.toString("base64"),
    },
    title: d.fileName,
  }));

  let response;
  try {
    response = await anthropic.messages.create(
      {
        model: env.CLAUDE_MODEL!,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [...documentBlocks, { type: "text", text: buildExtractionPrompt(documentNames) }],
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
