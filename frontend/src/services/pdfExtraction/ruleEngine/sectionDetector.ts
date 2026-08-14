/**
 * SECTION DETECTOR — splits a document's pages into labeled blocks
 * (headings → next heading) and classifies each one against a small set
 * of canonical PMO-relevant section names, or flags it as noise to ignore
 * entirely (Disclaimer, Company Profile, marketing/credentials pages,
 * table of contents). The Field Mapping Engine searches a field's hinted
 * sections first and never even looks inside an ignored section — the
 * "don't search the whole document blindly" requirement.
 *
 * Heading detection is a lightweight heuristic (numbered headings like
 * "5. PROPOSED COSTING", or a short, mostly-uppercase line like
 * "PAYMENT TERMS:-") rather than font-size/style analysis — pdfjs-dist's
 * text layer exposes position, not font weight/size reliably enough across
 * arbitrary client PDFs to lean on that instead.
 */

export interface PageLike {
  pageNumber: number;
  text: string;
}

export interface DetectedSection {
  /** A canonical name from CANONICAL_SECTION_KEYWORDS, "other" (unrecognized but not noise), or "ignored". */
  name: string;
  headingText: string;
  pageNumbers: number[];
  text: string;
  ignored: boolean;
}

const CANONICAL_SECTION_KEYWORDS: Record<string, string[]> = {
  "client details": ["client details", "client information"],
  "project details": ["project details", "project information", "introduction", "objectives", "general information"],
  "commercial details": [
    "commercial details",
    "commercial terms",
    "proposed costing",
    "costing",
    "terms & conditions",
    "terms and conditions",
    "commercial",
  ],
  "quantity schedule": ["quantity schedule", "bill of quantity", "boq", "activities"],
  "payment terms": ["payment terms", "payment milestones", "payment schedule"],
  "scope of work": ["scope of work"],
  deliverables: ["deliverables"],
  schedule: ["schedule", "duration", "validity"],
};

const IGNORED_SECTION_KEYWORDS = [
  "disclaimer",
  "company profile",
  "company information",
  "corporate information",
  "about us",
  "about ifluids",
  "consultants experience",
  "our experience",
  "legal notes",
  "marketing",
  "contents",
  "table of contents",
  "annexure",
  "certification",
  "certificate",
];

function isHeadingLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.length > 90) return false;

  // A line containing a preserved wide-column-gap tab (see pdfReader.ts) is
  // table/form-cell content, never a heading — a genuine section heading
  // is one contiguous span of text, not a multi-column row. Without this
  // guard, a short, mostly-uppercase table header row like
  // "S. NO.<TAB>SCOPE OF WORK<TAB>AMOUNT(INR)" gets misread as its own
  // heading, fragmenting the table into bogus sections (one of which then
  // gets classified as "scope of work" purely because a column happens to
  // be labeled that) instead of staying part of the table's real section.
  if (trimmed.includes("\t")) return false;

  // Numbered headings: "1. INTRODUCTION", "5. PROPOSED COSTING, TERMS & CONDITIONS"
  if (/^\d{1,2}[.)]\s+[A-Z]/.test(trimmed)) {
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  }

  // Short, (near-)all-caps standalone line: "DISCLAIMER", "PAYMENT TERMS:-", "SCOPE OF WORK".
  // Section labels like these are almost always 1-6 words — a real
  // section heading is a *label*, not a sentence. Capping both length and
  // word count keeps a genuinely emphasized (bolded/capitalized) content
  // line — e.g. a Scope of Work's actual title statement, "HAZOP STUDY
  // FOR DT, RT & SV SYSTEMS UNDER THE GAIL EPCM PROJECT" — from being
  // swallowed as its own heading instead of staying searchable body text.
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 3 && trimmed.length <= 45 && wordCount <= 6) {
    const upperCount = (letters.match(/[A-Z]/g) ?? []).length;
    if (upperCount / letters.length > 0.9) return true;
  }

  return false;
}

function classifyBlock(headingText: string, bodyPreview: string): { name: string; ignored: boolean } {
  const probe = `${headingText}\n${bodyPreview}`.toLowerCase();

  for (const keyword of IGNORED_SECTION_KEYWORDS) {
    if (probe.includes(keyword)) return { name: "ignored", ignored: true };
  }

  for (const [canonicalName, keywords] of Object.entries(CANONICAL_SECTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (probe.includes(keyword.toLowerCase())) return { name: canonicalName, ignored: false };
    }
  }

  return { name: "other", ignored: false };
}

interface TaggedLine {
  pageNumber: number;
  text: string;
}

export function detectSections(
  pages: PageLike[],
  extraHeadingHints: Partial<Record<string, string[]>> = {}
): DetectedSection[] {
  const keywordTable: Record<string, string[]> = { ...CANONICAL_SECTION_KEYWORDS };
  for (const [name, extra] of Object.entries(extraHeadingHints)) {
    if (!extra) continue;
    keywordTable[name] = [...(keywordTable[name] ?? []), ...extra.map((k) => k.toLowerCase())];
  }

  const lines: TaggedLine[] = pages.flatMap((page) =>
    page.text.split("\n").map((text) => ({ pageNumber: page.pageNumber, text }))
  );

  const sections: DetectedSection[] = [];
  let currentHeading = "";
  let currentPages = new Set<number>();
  let currentLines: string[] = [];

  const flush = () => {
    if (currentLines.length === 0 && !currentHeading) return;
    const bodyText = currentLines.join("\n");
    const classified = classifyBlock(currentHeading, bodyText.slice(0, 400));
    sections.push({
      name: classified.name,
      headingText: currentHeading,
      pageNumbers: Array.from(currentPages).sort((a, b) => a - b),
      text: bodyText,
      ignored: classified.ignored,
    });
  };

  for (const line of lines) {
    if (isHeadingLine(line.text)) {
      flush();
      currentHeading = line.text.trim();
      currentPages = new Set([line.pageNumber]);
      currentLines = [];
    } else {
      currentPages.add(line.pageNumber);
      currentLines.push(line.text);
    }
  }
  flush();

  // Reclassify using the doc-type-aware keyword table built above (the
  // first pass above used the base table only, so headings that only a
  // template profile recognizes — e.g. a Work Order's "Order Details" —
  // still resolve correctly here).
  for (const section of sections) {
    if (section.name !== "other") continue;
    const reclassified = classifyBlockWithTable(section.headingText, section.text.slice(0, 400), keywordTable);
    section.name = reclassified.name;
    section.ignored = reclassified.ignored;
  }

  return sections;
}

function classifyBlockWithTable(
  headingText: string,
  bodyPreview: string,
  keywordTable: Record<string, string[]>
): { name: string; ignored: boolean } {
  const probe = `${headingText}\n${bodyPreview}`.toLowerCase();
  for (const [canonicalName, keywords] of Object.entries(keywordTable)) {
    for (const keyword of keywords) {
      if (probe.includes(keyword.toLowerCase())) return { name: canonicalName, ignored: false };
    }
  }
  return { name: "other", ignored: false };
}

/** Concatenated text of every non-ignored section whose name is in `names` — the Field Mapping Engine's primary search scope for a field with sectionHints. */
export function textForSections(sections: DetectedSection[], names: string[]): string {
  return sections
    .filter((s) => !s.ignored && names.includes(s.name))
    .map((s) => s.text)
    .join("\n\n");
}

/**
 * Concatenated BODY text of every non-ignored section — the fallback scope
 * when a field's hinted sections turn up nothing. Deliberately excludes
 * every section's `headingText` — a heading is structural metadata, not
 * content to label-match against. Including it once let a section heading
 * that happens to equal a field's own alias ("Scope of Work" is both the
 * canonical Project Title alias AND a section name) be mistaken for a
 * label with its value on "the next line" — which was just whatever
 * sentence the document's own body happened to start with, not a value at
 * all. Caught by testing against the real attached proposal, where this
 * silently produced "The Scope of work of iFluids Engineering is to
 * Conduct:" as the Project Title instead of leaving the label-match step
 * to correctly find nothing and fall through to the scope-derivation step.
 */
export function textForWholeDocument(sections: DetectedSection[]): string {
  return sections
    .filter((s) => !s.ignored)
    .map((s) => s.text)
    .join("\n\n");
}

/** Maps a character offset within `textForSections`/`textForWholeDocument`'s output back to the page it came from — best-effort, used only for the diagnostic `sourcePage` on a FieldCandidate. */
export function findSectionForText(sections: DetectedSection[], snippet: string): DetectedSection | undefined {
  return sections.find((s) => !s.ignored && s.text.includes(snippet));
}
