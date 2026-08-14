import type { PdfImportConfidence } from "../../../types/PdfImport";

/**
 * How a field's raw value was found — the ONE thing that decides its
 * numeric confidence, per the exact rubric specified: exact label match
 * (100), a recognized synonym/weaker label match (90), a bare pattern
 * match with no label at all (70), a value derived indirectly rather than
 * read from the document (40), or nothing found (0).
 *
 * `table-match` (a value read from a detected table cell/row against a
 * matched column header) and `context-match` (a value found near a
 * recognized keyword within the correct section, but with no explicit
 * "Label:" pairing) are Field Mapping Engine additions — they reuse the
 * same 90/70 numeric buckets as strong-label/regex respectively, since
 * PdfImportConfidence itself is a fixed 100|90|70|40|0 scale the Preview UI
 * already renders and must not change.
 */
export type MatchType =
  | "exact-label"
  | "strong-label"
  | "table-match"
  | "regex"
  | "context-match"
  | "inference"
  | "not-found";

const MATCH_TYPE_CONFIDENCE: Record<MatchType, PdfImportConfidence> = {
  "exact-label": 100,
  "strong-label": 90,
  "table-match": 90,
  regex: 70,
  "context-match": 70,
  inference: 40,
  "not-found": 0,
};

export function confidenceForMatchType(matchType: MatchType): PdfImportConfidence {
  return MATCH_TYPE_CONFIDENCE[matchType];
}

/**
 * A single raw candidate value the Field Mapping Engine found (or didn't)
 * for one field, before Normalizer touches it. `matchedAlias`/`sourcePage`
 * are diagnostic-only — they never reach the public PdfImportResponse type
 * (which the Preview UI renders and must not change) but feed into warning
 * messages so a user can see e.g. "Client matched via alias 'Employer' on
 * page 2" when something looks wrong.
 */
export interface FieldCandidate<T = string> {
  value: T | null;
  matchType: MatchType;
  matchedAlias?: string;
  sourcePage?: number;
  warnings?: string[];
}

export function notFound<T = string>(): FieldCandidate<T> {
  return { value: null, matchType: "not-found" };
}
