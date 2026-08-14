/**
 * PMO KNOWLEDGE BASE — the domain vocabulary a PMO coordinator already
 * carries in their head: "HAZOP" means Design Engineering Services,
 * "QRA" means Risk Management, and so on. This is business knowledge, not
 * document structure — it belongs in its own reusable, easy-to-extend
 * table, completely separate from fieldMappingConfig.ts's document-layout
 * aliases ("Client" vs "Employer" is about how a label is *written*; this
 * file is about what an engineering study *means*).
 *
 * Extending this to a new study type iFluids starts offering is a
 * one-line addition here — never a change to fieldMappingEngine.ts or any
 * extraction logic.
 */

export interface DepartmentKnowledgeEntry {
  keywords: string[];
  department: string;
}

export const DEPARTMENT_KNOWLEDGE_BASE: DepartmentKnowledgeEntry[] = [
  { keywords: ["hazop", "hazid", "hazard and operability", "hazard identification"], department: "Design Engineering Services" },
  { keywords: ["qra", "quantitative risk assessment", "bow tie", "bowtie", "risk assessment"], department: "Risk Management" },
  { keywords: ["sil", "lopa", "layer of protection analysis", "functional safety"], department: "Functional Safety" },
  { keywords: ["pipeline integrity"], department: "Pipeline Engineering" },
  { keywords: ["stress analysis", "pipe stress"], department: "Mechanical Engineering" },
];

/**
 * Scans `text` (normally the Scope of Work / Project Title, not the whole
 * document — a "HAZOP" mentioned once in passing on page 9 of an unrelated
 * proposal shouldn't drive Department) for the first matching keyword.
 * Returns null rather than a low-confidence guess if nothing matches —
 * the caller (fieldMappingEngine.ts) is the one that decides this counts
 * as "inference" tier, not this function.
 */
export function inferDepartmentFromText(text: string): { department: string; matchedKeyword: string } | null {
  const lower = text.toLowerCase();
  for (const entry of DEPARTMENT_KNOWLEDGE_BASE) {
    const matchedKeyword = entry.keywords.find((keyword) => lower.includes(keyword));
    if (matchedKeyword) return { department: entry.department, matchedKeyword };
  }
  return null;
}
