/**
 * Shared project-code normalization + matching, used everywhere a Timesheet,
 * Invoice, Expense, or Report record needs to be reconciled against a
 * Project's PR Number — instead of comparing raw strings, which breaks on
 * spacing/hyphen/underscore/capitalization differences and can't tell a
 * project-level code apart from one of its own Job Number milestones
 * (e.g. "PR-11040" vs "PR-11040 Job No. 03").
 *
 * Matching rule: two codes refer to the same project when their PR Number
 * matches AND either both carry the same Job Number, or neither carries one
 * at all. If only one side has a Job Number, they never match.
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
 *
 * The PR code is the leading code token(s) — extraction stops at an
 * explicit " - " separator, or at the first trailing all-letter word after
 * a digit-bearing token (which is also what excludes a trailing "Job No. 03"
 * suffix from the PR code itself). Hyphens/underscores/spaces and case are
 * then stripped so "PR-10039", "PR 10039", "PR_10039" and "pr10039" all
 * collapse to the same value, with leading zeros in the trailing digit run
 * stripped too ("PR-010039" -> "PR10039").
 */
export function parseProjectCode(raw: string): ParsedProjectCode {
  const collapsed = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (!collapsed) return { prCode: "", jobNumber: null };

  const underscoreJobMatch = collapsed.match(UNDERSCORE_JOB_NUMBER_PATTERN);
  const jobMatch = underscoreJobMatch ?? collapsed.match(JOB_NUMBER_PATTERN);
  const jobNumber = jobMatch ? stripLeadingZeros(jobMatch[1]) : null;

  // Strip a trailing "_3" job suffix before extracting the PR code so it
  // doesn't get folded into the PR digits. The textual "Job No. 3" form
  // never needs this — the token loop below already stops before it.
  const codeSource = underscoreJobMatch ? collapsed.slice(0, underscoreJobMatch.index) : collapsed;

  const tokens = codeSource.split(" ");
  const codeTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
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
