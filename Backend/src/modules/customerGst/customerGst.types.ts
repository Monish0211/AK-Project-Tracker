/**
 * Shapes used by Customer GST Document Import/Extraction (Sep 2026).
 * Deliberately mirrors pdfImport.types.ts's AiExtractedField<T> pattern
 * (value/confidence/warnings?/source) rather than inventing a new shape —
 * same UI contract (confidence-capped, "please verify" warning), just a
 * much smaller field set: a GST certificate has one thing to extract
 * (GSTIN, legal name, trade name, state), not a whole project's worth of
 * fields, so there is no fieldSources/conflicts multi-document machinery
 * here — this is always exactly one document.
 *
 * IMPORTANT: this module extracts what a document SAYS, never whether the
 * GSTIN is currently valid/registered. Real GST verification (a lookup
 * against an authoritative GST registry) is explicitly a separate, not-yet-
 * built capability — see gstExtractionAdapter.service.ts's own comment.
 */

export type GstExtractionConfidence = 70 | 0;

export type GstFieldSource = "ai";

export interface GstExtractedField<T> {
  value: T;
  confidence: GstExtractionConfidence;
  warnings?: string[];
  source: GstFieldSource;
}

export interface GstExtractionCandidate {
  gstNumber: GstExtractedField<string>;
  gstLegalName: GstExtractedField<string>;
  gstTradeName: GstExtractedField<string>;
  gstState: GstExtractedField<string>;
}
