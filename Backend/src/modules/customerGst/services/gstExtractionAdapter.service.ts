import type { GstClaudeExtractionResult } from "../validators/gstClaudeResponse.validators.js";
import type { GstExtractedField, GstExtractionCandidate } from "../customerGst.types.js";

/**
 * The single conversion boundary from Claude's world into the reviewable
 * candidate shape — mirrors pdfImportResponseAdapter.service.ts's
 * confidence-capping rule exactly: every field Claude actually supplied is
 * capped at confidence 70 (never higher, regardless of anything Claude
 * itself claims) and carries an explicit "please verify" warning. A field
 * Claude didn't find is confidence 0 with an empty value — never guessed,
 * never fabricated.
 *
 * VERY IMPORTANT — extraction is not verification: nothing produced here
 * ever asserts "this GSTIN is valid" or "this GSTIN is registered." It only
 * ever means "this is what the uploaded document appears to say." Real GST
 * verification (checking a GSTIN against an authoritative registry) is a
 * separate, not-yet-built capability and is deliberately out of scope here
 * — see the approved audit's Section 5 (production-safety/audit report).
 */

const AI_VERIFY_WARNING = "AI-suggested value — please verify.";

function wrapStringField(value: string | null | undefined): GstExtractedField<string> {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { value: "", confidence: 0, source: "ai" };
  }
  return { value: trimmed, confidence: 70, warnings: [AI_VERIFY_WARNING], source: "ai" };
}

export function buildGstExtractionCandidate(claude: GstClaudeExtractionResult): GstExtractionCandidate {
  return {
    gstNumber: wrapStringField(claude.gstNumber),
    gstLegalName: wrapStringField(claude.legalName),
    gstTradeName: wrapStringField(claude.tradeName),
    gstState: wrapStringField(claude.state),
  };
}
