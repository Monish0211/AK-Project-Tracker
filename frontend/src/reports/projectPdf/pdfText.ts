/**
 * Text safety for the Project Financial Report PDF (Oct 2026).
 *
 * The PDF embeds Noto Sans subsets (Latin, Latin-1/Extended-A, general
 * punctuation, currency symbols). jsPDF silently drops any character the
 * embedded font has no glyph for, and it has no text-shaping engine, so even
 * an embedded Tamil/Devanagari font would draw those scripts with vowel signs
 * and conjuncts in the wrong order (verified visually, Oct 2026).
 *
 * Rule: a character is drawn only if both embedded fonts contain it. Every
 * run of other characters (Tamil, Hindi, Chinese, emoji, …) becomes one
 * visible U+FFFD "�" and the PDF carries a note explaining it — text is never
 * removed silently and never drawn misspelled.
 */

/**
 * Exact code points present in BOTH NotoSans-Regular-subset.ttf and
 * NotoSans-Bold-subset.ttf — generated from the fonts' own cmaps with
 * fontTools when the subsets were built. Regenerate if the subsets change
 * (tests/projectPdf.test.mjs checks every entry against the embedded font).
 */
export const PDF_SUPPORTED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e],
  [0x00a0, 0x017f],
  [0x0192, 0x0192],
  [0x02c6, 0x02c6],
  [0x02dc, 0x02dc],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x2044, 0x2044],
  [0x20a0, 0x20c0],
  [0x2116, 0x2116],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
  [0xfffd, 0xfffd],
];

export const UNSUPPORTED_MARKER = "�";

export function isPdfSupportedCodePoint(cp: number): boolean {
  for (const [lo, hi] of PDF_SUPPORTED_RANGES) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

export interface PdfTextResult {
  text: string;
  replaced: boolean;
}

/**
 * NFC-normalises (so "e" + combining acute becomes the supported "é"), keeps
 * line breaks, turns tabs/other whitespace into spaces, and replaces each run
 * of unsupported characters with a single UNSUPPORTED_MARKER.
 */
export function toPdfText(value: string): PdfTextResult {
  let out = "";
  let replaced = false;
  let inRun = false;
  for (const ch of value.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n") {
      out += ch;
      inRun = false;
    } else if (isPdfSupportedCodePoint(cp)) {
      out += ch;
      inRun = false;
    } else if (/\s/u.test(ch)) {
      out += " ";
      inRun = false;
    } else if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) {
      // Zero-width joiner / variation selectors belong to the surrounding run (emoji sequences).
      if (!inRun) {
        out += UNSUPPORTED_MARKER;
        inRun = true;
        replaced = true;
      }
    } else if (!inRun) {
      out += UNSUPPORTED_MARKER;
      inRun = true;
      replaced = true;
    }
  }
  return { text: out, replaced };
}

/** Returns a copy of any plain-data value with every string passed through toPdfText(); reports whether anything was replaced. */
export function sanitizeForPdf<T>(value: T): { value: T; replaced: boolean } {
  let replaced = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = toPdfText(v);
      if (r.replaced) replaced = true;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date || v === null || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v as Record<string, unknown>)) out[k] = walk(inner);
    return out;
  };
  const result = walk(value) as T;
  return { value: result, replaced };
}
