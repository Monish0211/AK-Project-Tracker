/**
 * Customer GST Document Import/Extraction (Sep 2026) — mirrors the backend's
 * customerGst.types.ts GstExtractedField<T>/GstExtractionCandidate shape.
 * Every field is AI-suggested, review-before-save data — never
 * auto-persisted, and never a claim that a GSTIN is currently valid or
 * registered (see gstExtractionAdapter.service.ts's own comment on the
 * backend).
 */
export interface GstExtractedField<T> {
  value: T;
  confidence: 70 | 0;
  warnings?: string[];
  source: "ai";
}

export interface GstExtractionCandidate {
  gstNumber: GstExtractedField<string>;
  gstLegalName: GstExtractedField<string>;
  gstTradeName: GstExtractedField<string>;
  gstState: GstExtractedField<string>;
}
