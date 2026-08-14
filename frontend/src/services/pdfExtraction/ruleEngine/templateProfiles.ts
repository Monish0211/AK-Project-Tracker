import type { DocumentType } from "./documentClassifier";
import type { FieldMappingRule } from "./fieldMappingConfig";

/**
 * TEMPLATE PROFILES — per-document-type alias and section-heading
 * additions layered on top of the base fieldMappingConfig.ts dictionary
 * after documentClassifier.ts identifies what kind of document this is.
 * A Techno-Commercial Proposal and a Work Order both eventually fill in
 * `project.client`, but a Proposal is far more likely to say "Client"
 * while a Work Order says "Employer" — the base dictionary already knows
 * both words, but a profile can promote the doc-type-typical one to the
 * front of the list (checked first, and the only one that can score a
 * same-line match as the *canonical* label rather than a synonym).
 *
 * Profiles only ever ADD to the base dictionary — they never remove an
 * alias a different template might still need, since the same PDF export
 * pipeline in a client's ERP can vary its own wording between revisions.
 */

export interface TemplateProfile {
  docType: DocumentType;
  /** targetField -> extra aliases, prepended ahead of the base config's own list (so they win ties and can score as canonical for this doc type). */
  priorityAliases?: Partial<Record<string, string[]>>;
  /** canonical section name -> extra heading phrases specific to this doc type, merged into sectionDetector.ts's own keyword table. */
  sectionHeadingHints?: Partial<Record<string, string[]>>;
  /**
   * Business inference, not a document fact: iFluids conventionally quotes
   * this document type on this contract basis. Used ONLY as fieldMappingEngine.ts's
   * last-resort fallback for Contract Type, after an explicit label and a
   * bare "lump sum"/"ARC" keyword scan have both found nothing — scored as
   * "inference" (40%), so a low-confidence warning still fires and the
   * value is never presented as if the document stated it directly.
   */
  inferredContractType?: string;
}

const TEMPLATE_PROFILES: TemplateProfile[] = [
  {
    docType: "Techno Commercial Proposal",
    priorityAliases: {
      projectTitle: ["Scope of Work", "Subject"],
      workOrderValueRaw: ["Total Cost (INR)", "Total Cost", "Proposed Costing"],
    },
    sectionHeadingHints: {
      "commercial details": ["Proposed Costing", "Costing, Terms & Conditions", "Terms & Conditions"],
      "payment terms": ["Payment Terms"],
      "scope of work": ["Scope of Work"],
      deliverables: ["Deliverables"],
    },
    inferredContractType: "LUMP SUM",
  },
  {
    docType: "Technical Proposal",
    priorityAliases: {
      projectTitle: ["Scope of Work", "Subject"],
    },
    sectionHeadingHints: {
      "scope of work": ["Scope of Work"],
      deliverables: ["Deliverables"],
    },
    inferredContractType: "LUMP SUM",
  },
  {
    docType: "Engineering Proposal",
    priorityAliases: {
      projectTitle: ["Scope of Engineering", "Scope of Work", "Subject"],
      workOrderValueRaw: ["Total Cost (INR)", "Total Cost"],
    },
    sectionHeadingHints: {
      "scope of work": ["Scope of Engineering", "Scope of Work"],
    },
    inferredContractType: "LUMP SUM",
  },
  {
    docType: "Work Order",
    priorityAliases: {
      client: ["Employer", "Owner"],
      workOrderNumber: ["WO No", "Work Order No"],
      workOrderDate: ["Order Date"],
    },
    sectionHeadingHints: {
      "commercial details": ["Order Details", "Commercial Terms"],
    },
  },
  {
    docType: "Purchase Order",
    priorityAliases: {
      client: ["Buyer"],
      poNumber: ["PO No", "Purchase Order No"],
    },
    sectionHeadingHints: {
      "commercial details": ["Order Details", "Delivery Schedule"],
    },
  },
  {
    docType: "Service Order",
    priorityAliases: {
      workOrderNumber: ["Service Order No", "Service Order Number"],
    },
  },
  {
    docType: "Quotation",
    priorityAliases: {
      workOrderNumber: ["Quote No", "Quotation No"],
      workOrderValueRaw: ["Quoted Amount", "Total Quotation Value"],
    },
  },
  {
    docType: "Tender",
    priorityAliases: {
      workOrderNumber: ["Tender No", "Bid No"],
    },
  },
  {
    docType: "Contract Agreement",
    priorityAliases: {
      client: ["Party of the Second Part"],
      workOrderNumber: ["Agreement No", "Contract No"],
    },
  },
  {
    docType: "Letter of Intent",
    priorityAliases: {
      workOrderNumber: ["LOI No", "LOI Reference"],
    },
  },
];

export function getTemplateProfile(docType: DocumentType): TemplateProfile | undefined {
  return TEMPLATE_PROFILES.find((p) => p.docType === docType);
}

/** Prepends the profile's priority aliases onto each matching rule, deduping case-insensitively so a phrase already present isn't listed twice. */
export function applyTemplateProfile(baseConfig: FieldMappingRule[], docType: DocumentType): FieldMappingRule[] {
  const profile = getTemplateProfile(docType);
  if (!profile?.priorityAliases) return baseConfig;

  return baseConfig.map((rule) => {
    const extra = profile.priorityAliases?.[rule.targetField];
    if (!extra || extra.length === 0) return rule;

    const existingLower = new Set(rule.aliases.map((a) => a.toLowerCase()));
    const newAliases = extra.filter((a) => !existingLower.has(a.toLowerCase()));
    if (newAliases.length === 0) return rule;

    return { ...rule, aliases: [...newAliases, ...rule.aliases] };
  });
}

export function getSectionHeadingHints(docType: DocumentType): Partial<Record<string, string[]>> {
  return getTemplateProfile(docType)?.sectionHeadingHints ?? {};
}

export function getInferredContractType(docType: DocumentType): string | undefined {
  return getTemplateProfile(docType)?.inferredContractType;
}
