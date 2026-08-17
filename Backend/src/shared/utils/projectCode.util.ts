/**
 * Backend port of frontend/src/utils/projectMatching.ts — same PR-Number
 * normalization/matching rule, kept byte-for-byte equivalent so a Timesheet
 * row's Project Code can never be judged a match on one side of the app and
 * a non-match on the other. See that file for the original design note this
 * is copied from.
 *
 * Matching rule: two codes refer to the same project when their PR Number
 * matches AND either both carry the same Job Number, or neither carries one
 * at all. If only one side has a Job Number, they never match.
 *
 * Phase 3.8: this is the ONLY project-matching mechanism the Timesheet
 * engine uses — there is deliberately no `Project.prNoNormalized` column
 * (Stage 3 revised this after evaluating query performance vs. schema/
 * migration/consistency cost at this application's real scale; see
 * timesheet.service.ts's buildProjectLookupMap() for how this is used
 * as an in-memory, once-per-import lookup instead of a per-row query).
 */

export interface ParsedProjectCode {
  /** PR code with formatting differences collapsed (e.g. "PR-11040" / "PR 11040" -> "PR11040"). Empty string if none could be extracted. */
  prCode: string;
  /**
   * Job Number with leading zeros stripped (e.g. "Job No. 03" -> "3").
   * `null` means the raw string carries no Job Number at all — distinct
   * from carrying one, which is what the "only one side has a Job Number
   * -> no match" rule keys off.
   */
  jobNumber: string | null;
}

const JOB_NUMBER_PATTERN = /JOB\s*(?:NO\.?)?\s*(\d+)/;

// "PR-11040_3" — a Job Number appended directly to the PR code via an
// underscore, e.g. as an alternate PR Number format. Only counts as a Job
// Number when a digit immediately precedes the underscore (so "PR_10039",
// where the underscore is just a plain separator with no digit before it,
// is untouched and keeps normalizing as a single PR code, same as before).
const UNDERSCORE_JOB_NUMBER_PATTERN = /(?<=\d)_(\d+)$/;

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d)/, "");
}

/**
 * Extracts the PR Number and (optional) Job Number from a free-text project
 * code cell such as "PR-10039 - HAZOP", "PR10039 Revamp", "PR-11040 Job No.
 * 03", or "PR-11040_3".
 */
export function parseProjectCode(raw: string): ParsedProjectCode {
  const collapsed = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (!collapsed) return { prCode: "", jobNumber: null };

  const underscoreJobMatch = collapsed.match(UNDERSCORE_JOB_NUMBER_PATTERN);
  const jobMatch = underscoreJobMatch ?? collapsed.match(JOB_NUMBER_PATTERN);
  const jobNumber = jobMatch ? stripLeadingZeros(jobMatch[1]!) : null;

  // Strip a trailing "_3" job suffix before extracting the PR code so it
  // doesn't get folded into the PR digits. The textual "Job No. 3" form
  // never needs this — the token loop below already stops before it.
  const codeSource = underscoreJobMatch ? collapsed.slice(0, underscoreJobMatch.index) : collapsed;

  const tokens = codeSource.split(" ");
  const codeTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "-" || token === "–" || token === "—") break;

    codeTokens.push(token);

    if (/\d/.test(token)) {
      const next = tokens[i + 1];
      if (next && /^[A-Z]+$/.test(next)) break;
    }
  }

  const joinedCode = codeTokens.join("").replace(/[-_]+/g, "");
  const prCode = joinedCode.replace(/^(\D*)0+(?=\d)/, "$1");

  return { prCode, jobNumber };
}

/**
 * Canonical single-string key for a project code — safe to use directly in
 * `===` comparisons, as a Set entry, or as a Map key. Encodes both the PR
 * code and the Job Number's presence/value, so two codes only collapse to
 * the same key when they represent the same project per the matching rule
 * above. Returns "" when no PR code could be extracted.
 */
export function normalizeProjectCode(raw: string): string {
  const { prCode, jobNumber } = parseProjectCode(raw);
  if (!prCode) return "";
  return jobNumber === null ? prCode : `${prCode}::JOB${jobNumber}`;
}

/**
 * Pairwise convenience wrapper for one-off comparisons — equivalent to
 * `normalizeProjectCode(a) === normalizeProjectCode(b)`, but also guards
 * against two unparseable/empty codes silently being treated as a match.
 */
export function isSameProjectCode(a: string, b: string): boolean {
  const keyA = normalizeProjectCode(a);
  const keyB = normalizeProjectCode(b);
  return !!keyA && !!keyB && keyA === keyB;
}
