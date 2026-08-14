import type { MatchType } from "./confidenceScoring";

/**
 * CONTEXT MATCHER — the generic, reusable matching primitives every field
 * in fieldMappingConfig.ts is resolved with. Nothing here knows what
 * "Client" or "Work Order Number" mean; it only knows how to look for
 * *a* label near *a* value, in every layout this pipeline has been taught
 * to recognize:
 *
 *  1. Same line, `Label : Value` or `Label - Value`.
 *  2. Same line, `Label<TAB>Value` — a bordered table/form cell pair,
 *     recognized because pdfReader.ts preserves wide column gaps as a
 *     literal tab rather than collapsing them to a single space.
 *  3. Label alone on its own line, value on the next line.
 *  4. A label-free pattern anywhere in the (already section-scoped) text —
 *     used only as a last resort, and scored lower accordingly.
 */

export interface ContextMatch {
  value: string;
  matchType: MatchType;
  matchedAlias: string;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the first plausible number out of raw text, tolerant of a
 * leading currency word/abbreviation with its own punctuation ("Rs. 42,000.00",
 * "INR 12,50,000", "$3,500") — stripping non-digit characters blindly (the
 * old approach) turns "Rs. 42,000.00" into ".42000.00" (two decimal points,
 * NaN); this instead finds where the actual number starts and only strips
 * the thousands-separator commas from within it.
 */
export function parseNumeric(raw: string): number | null {
  const match = raw.match(/\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * A short, generic word that's overwhelmingly more likely to be a TABLE
 * COLUMN HEADER than a real field value — guards the table-cell strategy
 * below against a collision like a cost table's own
 * "SCOPE OF WORK<TAB>AMOUNT(INR)" header row being mistaken for a
 * Project Title's "Scope of Work" label paired with an "AMOUNT(INR)" value.
 */
const COLUMN_HEADER_LOOKALIKES = [
  "amount",
  "qty",
  "quantity",
  "rate",
  "uom",
  "unit",
  "total",
  "gst",
  "tax",
  "description",
  "particulars",
  "activity",
  "item",
];

function looksLikeColumnHeaderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized || normalized.length > 20) return false;
  return COLUMN_HEADER_LOOKALIKES.some((keyword) => normalized === keyword || normalized === `${keyword}inr`);
}

/**
 * Tries every alias (canonical first, then synonyms, then weak/ambiguous
 * aliases) against all three label-based layouts, strongest layout first.
 * `weakAliases` (e.g. a bare "Date") never score above context-match (70%)
 * even on an otherwise-perfect same-line match — a generic word is too easy
 * to have matched the wrong field's label by coincidence.
 */
export function matchLabelValue(text: string, aliases: string[], weakAliases: string[] = []): ContextMatch | null {
  const weakSet = new Set(weakAliases.map((a) => a.toLowerCase()));
  const allAliases = [...aliases, ...weakAliases];

  // Every pattern below anchors the alias to the START of a line (allowing
  // only leading whitespace/bullet characters before it) via the "m" flag's
  // per-line ^/$. Without this, a short alias that's a genuine substring of
  // a longer one — "Order Date" inside "Work Order Date" — would match
  // wherever it appears mid-line, silently stealing the wrong field's value.
  const lineStart = "^[ \\t\\u2013\\u2022\\-*]*";

  // 1. Same line, colon/dash separated.
  for (let i = 0; i < allAliases.length; i++) {
    const alias = allAliases[i];
    const pattern = new RegExp(`${lineStart}${escapeRegex(alias)}\\s*[:\\-]\\s*([^\\n\\t]+)$`, "im");
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      const isWeak = weakSet.has(alias.toLowerCase());
      const matchType: MatchType = isWeak ? "context-match" : i === 0 ? "exact-label" : "strong-label";
      return { value: match[1].trim(), matchType, matchedAlias: alias };
    }
  }

  // 2. Same line, tab-separated table/form cell.
  for (const alias of allAliases) {
    const pattern = new RegExp(`${lineStart}${escapeRegex(alias)}\\s*\\t+\\s*([^\\n\\t]+)$`, "im");
    const match = text.match(pattern);
    if (match && match[1].trim() && !looksLikeColumnHeaderValue(match[1])) {
      const isWeak = weakSet.has(alias.toLowerCase());
      return { value: match[1].trim(), matchType: isWeak ? "context-match" : "table-match", matchedAlias: alias };
    }
  }

  // 3. Label alone on its own line, value on the next line.
  for (const alias of allAliases) {
    const pattern = new RegExp(`${lineStart}${escapeRegex(alias)}\\s*[:\\-]?\\s*$\\n\\s*([^\\n]+)`, "im");
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      const isWeak = weakSet.has(alias.toLowerCase());
      return { value: match[1].trim(), matchType: isWeak ? "context-match" : "strong-label", matchedAlias: alias };
    }
  }

  return null;
}

/** A label-free pattern (email, phone) tried only once no aliased match exists anywhere — "Regex" in the Confidence Engine's own terms. */
export function matchBareRegex(text: string, pattern: RegExp): ContextMatch | null {
  const match = text.match(pattern);
  if (match && match[1] && match[1].trim()) {
    return { value: match[1].trim(), matchType: "regex", matchedAlias: "(pattern)" };
  }
  return null;
}

/**
 * Same three label-based layouts as `matchLabelValue`, but for a field
 * where a matched value can legitimately be the WRONG entity entirely — a
 * Client Email field matching iFluids' own "Email: info@ifluids.com"
 * footer line is not a bad regex, it's the right pattern finding the wrong
 * business entity. Every candidate on a given layout is collected (via a
 * global scan) and `isExcluded` filters them before the first surviving
 * one is returned; a layout where every candidate is excluded falls
 * through to the next layout, exactly like a layout with no match at all.
 */
export function matchLabelValueExcluding(
  text: string,
  aliases: string[],
  weakAliases: string[],
  isExcluded: (value: string) => boolean
): ContextMatch | null {
  const weakSet = new Set(weakAliases.map((a) => a.toLowerCase()));
  const allAliases = [...aliases, ...weakAliases];
  const lineStart = "^[ \\t\\u2013\\u2022\\-*]*";

  const tryLayout = (
    buildPattern: (alias: string) => RegExp,
    onMatch: (alias: string, aliasIndex: number, value: string) => ContextMatch | null
  ): ContextMatch | null => {
    for (let i = 0; i < allAliases.length; i++) {
      const alias = allAliases[i];
      const pattern = buildPattern(alias);
      for (const match of text.matchAll(pattern)) {
        const value = match[1]?.trim();
        if (!value || isExcluded(value)) continue;
        const result = onMatch(alias, i, value);
        if (result) return result;
      }
    }
    return null;
  };

  const sameLine = tryLayout(
    (alias) => new RegExp(`${lineStart}${escapeRegex(alias)}\\s*[:\\-]\\s*([^\\n\\t]+)$`, "gim"),
    (alias, i, value) => {
      const isWeak = weakSet.has(alias.toLowerCase());
      const matchType: MatchType = isWeak ? "context-match" : i === 0 ? "exact-label" : "strong-label";
      return { value, matchType, matchedAlias: alias };
    }
  );
  if (sameLine) return sameLine;

  const tableCell = tryLayout(
    (alias) => new RegExp(`${lineStart}${escapeRegex(alias)}\\s*\\t+\\s*([^\\n\\t]+)$`, "gim"),
    (alias, _i, value) => {
      if (looksLikeColumnHeaderValue(value)) return null;
      const isWeak = weakSet.has(alias.toLowerCase());
      return { value, matchType: isWeak ? "context-match" : "table-match", matchedAlias: alias };
    }
  );
  if (tableCell) return tableCell;

  const nextLine = tryLayout(
    (alias) => new RegExp(`${lineStart}${escapeRegex(alias)}\\s*[:\\-]?\\s*$\\n\\s*([^\\n]+)`, "gim"),
    (alias, _i, value) => {
      const isWeak = weakSet.has(alias.toLowerCase());
      return { value, matchType: isWeak ? "context-match" : "strong-label", matchedAlias: alias };
    }
  );
  if (nextLine) return nextLine;

  return null;
}

/** The excluding counterpart to `matchBareRegex` — collects every label-free match and returns the first one `isExcluded` doesn't reject. */
export function matchBareRegexExcluding(
  text: string,
  pattern: RegExp,
  isExcluded: (value: string) => boolean
): ContextMatch | null {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  for (const match of text.matchAll(global)) {
    const value = match[1]?.trim();
    if (value && !isExcluded(value)) {
      return { value, matchType: "regex", matchedAlias: "(pattern)" };
    }
  }
  return null;
}

/**
 * A label-free pattern searched only within an already section-scoped
 * slice of text — "Context Match" in the Confidence Engine's own terms.
 * Used for values a document states in prose rather than a Label:Value
 * pair (e.g. "The duration of the project will be Two (02) Weeks." under
 * a Schedule heading, with no "Duration:" label anywhere).
 */
export function matchInSection(
  sectionText: string,
  pattern: RegExp,
  matchedAliasLabel: string,
  combine: (match: RegExpMatchArray) => string = (m) => m[1] ?? ""
): ContextMatch | null {
  const match = sectionText.match(pattern);
  if (!match) return null;
  const value = combine(match).trim();
  if (!value) return null;
  return { value, matchType: "context-match", matchedAlias: matchedAliasLabel };
}

/** Resolves free text against a fixed enum's canonical spelling, then its synonym keyword list, case-insensitively. Returns null (never guesses) if nothing matches. */
export function matchEnum(
  rawValue: string,
  options: readonly string[],
  synonyms?: Record<string, string[]>
): string | null {
  const trimmedLower = rawValue.trim().toLowerCase();

  const exact = options.find((o) => o.toLowerCase() === trimmedLower);
  if (exact) return exact;

  if (synonyms) {
    for (const option of options) {
      const keywords = synonyms[option];
      if (!keywords) continue;
      for (const keyword of keywords) {
        try {
          if (new RegExp(keyword, "i").test(rawValue)) return option;
        } catch {
          if (trimmedLower.includes(keyword.toLowerCase())) return option;
        }
      }
    }
  }

  return null;
}

/** Currency-style symbol/code detection with no label at all — scans for each option's regex pattern anywhere in the text. */
export function matchSymbolFallback(text: string, symbolPatterns: Record<string, RegExp>): ContextMatch | null {
  for (const [option, pattern] of Object.entries(symbolPatterns)) {
    if (pattern.test(text)) {
      return { value: option, matchType: "regex", matchedAlias: "(symbol)" };
    }
  }
  return null;
}
