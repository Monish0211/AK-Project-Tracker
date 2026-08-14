import type { FieldCandidate } from "./confidenceScoring";
import { notFound } from "./confidenceScoring";
import type { FieldMappingRule } from "./fieldMappingConfig";
import { FIELD_MAPPING_CONFIG } from "./fieldMappingConfig";
import type { DocumentType } from "./documentClassifier";
import { applyTemplateProfile, getInferredContractType } from "./templateProfiles";
import type { DetectedSection } from "./sectionDetector";
import { findSectionForText, textForSections, textForWholeDocument } from "./sectionDetector";
import {
  matchBareRegex,
  matchBareRegexExcluding,
  matchInSection,
  matchLabelValue,
  matchLabelValueExcluding,
  matchSymbolFallback,
} from "./contextMatcher";
import { isOwnCompanyValue } from "./companyIdentity";
import { inferDepartmentFromText } from "./pmoKnowledgeBase";

/**
 * THE FIELD MAPPING ENGINE — resolves every field in fieldMappingConfig.ts
 * (as adjusted by the current document's Template Profile) against the
 * document's Detected Sections, in one reusable pass. No field's name is
 * hardcoded here — every field is resolved by the same sequence of
 * generic strategies, reading only from its own config entry:
 *
 *   1. Label match, searched in the field's hinted sections first, then
 *      (only if nothing was found) the whole non-ignored document. If the
 *      field is marked `excludeIfOwnCompany`, every candidate is checked
 *      against companyIdentity.ts and skipped in favor of the next one —
 *      a Client Email field must never resolve to iFluids' own footer
 *      email just because it's the first "Email:" label in the document.
 *   2. Enum-only label-free fallbacks: a currency-style symbol scan, then
 *      a bare-keyword synonym scan.
 *   3. A field's own `contextPattern` — a label-free, section-scoped prose
 *      pattern (e.g. a duration stated as a sentence, not a label).
 *   4. Project Title's own scope-derivation fallback (see below).
 *   5. Bare regex (email/phone) — label-free, whole document, same
 *      company-identity guard as step 1.
 *   6. `useKnowledgeBase` fields (Department): a business-vocabulary scan
 *      of the Scope of Work text via pmoKnowledgeBase.ts.
 *   7. `useDocTypeInference` (Contract Type only, for now): the document
 *      type's own conventional contract basis, per templateProfiles.ts.
 *   8. `inferByMention`: the weakest signal — an enum option's own name
 *      appearing anywhere in the document at all.
 *
 * Two genuinely bespoke pieces of business logic stay out of this file on
 * purpose: "Domestic/Foreign inferred from PR Category" and turning a raw
 * duration string into `{value, unit}` are cross-field correlation and
 * unit-conversion — Normalizer's job (Stage 2), not field *mapping*.
 */

export type FieldMappingResult = Record<string, FieldCandidate<string>>;

const SCOPE_TEXT_SECTIONS = ["scope of work", "project details"];

/** Lines that introduce the real scope statement rather than stating it — filtered out so Project Title derivation lands on the actual sentence, not the sentence announcing one is coming. */
const SCOPE_BOILERPLATE_PATTERNS = [
  /scope of work of .* is to conduct/i,
  /^the scope of work/i,
  /is to conduct:?$/i,
  /^scope of work$/i,
  /^\d{1,2}[.)]\s*scope of work$/i,
];

function attachSourcePage(candidateValue: string, sections: DetectedSection[]): number | undefined {
  const section = findSectionForText(sections, candidateValue);
  return section?.pageNumbers[0];
}

/**
 * Project Title's dedicated fallback — real proposals often state their
 * title as a narrative sentence under a "Scope of Work" heading rather
 * than any Label:Value pair ("HAZOP STUDY FOR DT, RT & SV SYSTEMS UNDER
 * THE GAIL EPCM PROJECT"), which no generic label/context pattern can
 * safely generalize without risking overfitting to one document's exact
 * phrasing. This is a deliberate, narrow exception — same precedent as
 * Normalizer's domesticForeign correlation — not a pattern meant to be
 * copied for other fields. Scored as context-match ("Derived from Scope",
 * medium confidence), never higher, since it's read from prose, not a label.
 */
function deriveProjectTitleFromScope(sections: DetectedSection[]): FieldCandidate<string> | null {
  const scopeText = textForSections(sections, ["scope of work"]);
  if (!scopeText) return null;

  const candidateLines = scopeText
    .split("\n")
    .map((line) => line.trim().replace(/^[➢➤•\-*·]\s*/, ""))
    .filter((line) => line.length >= 15)
    .filter((line) => !SCOPE_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line)));

  const title = candidateLines[0];
  if (!title) return null;

  return {
    value: title,
    matchType: "context-match",
    matchedAlias: "(scope of work)",
    sourcePage: attachSourcePage(title, sections),
  };
}

function resolveField(
  rule: FieldMappingRule,
  sections: DetectedSection[],
  wholeDocText: string,
  docType: DocumentType
): FieldCandidate<string> {
  const scopedText = rule.sectionHints?.length ? textForSections(sections, rule.sectionHints) : "";
  const isExcluded = rule.excludeIfOwnCompany
    ? (value: string) => isOwnCompanyValue(value, rule.excludeIfOwnCompany!)
    : null;

  // 1. Label match — section-scoped first, whole-document fallback.
  const match = isExcluded
    ? (scopedText && matchLabelValueExcluding(scopedText, rule.aliases, rule.weakAliases ?? [], isExcluded)) ||
      matchLabelValueExcluding(wholeDocText, rule.aliases, rule.weakAliases ?? [], isExcluded)
    : (scopedText && matchLabelValue(scopedText, rule.aliases, rule.weakAliases)) ||
      matchLabelValue(wholeDocText, rule.aliases, rule.weakAliases);

  if (match) {
    return {
      value: match.value,
      matchType: match.matchType,
      matchedAlias: match.matchedAlias,
      sourcePage: attachSourcePage(match.value, sections),
    };
  }

  // 2. Enum-only label-free fallbacks.
  if (rule.dataType === "enum" && rule.enumOptions) {
    if (rule.symbolPatterns) {
      const symbolMatch = matchSymbolFallback(wholeDocText, rule.symbolPatterns);
      if (symbolMatch) {
        return { value: symbolMatch.value, matchType: symbolMatch.matchType, matchedAlias: symbolMatch.matchedAlias };
      }
    }

    if (rule.enumSynonyms) {
      // Bare keyword scan — no label at all, just "does any synonym phrase
      // for this option appear in the document."
      for (const option of rule.enumOptions) {
        const keywords = rule.enumSynonyms[option] ?? [];
        const found = keywords.some((keyword) => {
          try {
            return new RegExp(keyword, "i").test(wholeDocText);
          } catch {
            return wholeDocText.toLowerCase().includes(keyword.toLowerCase());
          }
        });
        if (found) {
          return { value: option, matchType: "regex", matchedAlias: "(keyword)" };
        }
      }
    }
  }

  // 3. Section-scoped, label-free prose pattern.
  if (rule.contextPattern) {
    const searchText = scopedText || wholeDocText;
    const contextMatch = matchInSection(
      searchText,
      rule.contextPattern.pattern,
      rule.label,
      rule.contextPattern.combine
    );
    if (contextMatch) {
      return {
        value: contextMatch.value,
        matchType: contextMatch.matchType,
        matchedAlias: contextMatch.matchedAlias,
        sourcePage: attachSourcePage(contextMatch.value, sections),
      };
    }
  }

  // 4. This field's own scope-of-work derivation (see function doc; currently only meaningful for Project Title).
  if (rule.deriveFromScope) {
    const derived = deriveProjectTitleFromScope(sections);
    if (derived) return derived;
  }

  // 5. Bare regex (email/phone) — label-free, whole document.
  if (rule.bareRegex) {
    const bareMatch = isExcluded
      ? matchBareRegexExcluding(wholeDocText, rule.bareRegex, isExcluded)
      : matchBareRegex(wholeDocText, rule.bareRegex);
    if (bareMatch) {
      return { value: bareMatch.value, matchType: bareMatch.matchType, matchedAlias: bareMatch.matchedAlias };
    }
  }

  // 6. Business-vocabulary knowledge base (Department, via Scope of Work text).
  if (rule.useKnowledgeBase) {
    const scopeText = textForSections(sections, SCOPE_TEXT_SECTIONS) || wholeDocText;
    const inferred = inferDepartmentFromText(scopeText);
    if (inferred) {
      return { value: inferred.department, matchType: "inference", matchedAlias: `(knowledge base: ${inferred.matchedKeyword})` };
    }
  }

  // 7. Document type's own conventional value (Contract Type only, so far).
  if (rule.useDocTypeInference) {
    const inferredContractType = getInferredContractType(docType);
    if (inferredContractType) {
      return { value: inferredContractType, matchType: "inference", matchedAlias: `(document type: ${docType})` };
    }
  }

  // 8. Weakest possible signal — the enum option's own name mentioned anywhere.
  if (rule.inferByMention && rule.enumOptions) {
    for (const option of rule.enumOptions) {
      if (new RegExp(`\\b${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(wholeDocText)) {
        return { value: option, matchType: "inference", matchedAlias: "(mention)" };
      }
    }
  }

  return notFound();
}

export function runFieldMappingEngine(sections: DetectedSection[], docType: DocumentType): FieldMappingResult {
  const config = applyTemplateProfile(FIELD_MAPPING_CONFIG, docType);
  const wholeDocText = textForWholeDocument(sections);

  const result: FieldMappingResult = {};
  for (const rule of config) {
    result[rule.targetField] = resolveField(rule, sections, wholeDocText, docType);
  }
  return result;
}
