/**
 * DOCUMENT CLASSIFIER — identifies what kind of document was uploaded
 * before any field mapping happens, purely from its own content (headings,
 * repeated keywords, structure). Never looks at the file name. The result
 * feeds templateProfiles.ts, which layers doc-type-specific alias
 * priorities on top of the base fieldMappingConfig.ts dictionary.
 *
 * This is keyword scoring, not machine learning — a small, auditable
 * ruleset that's easy to extend with a new document type/keyword without
 * touching any extraction logic.
 */

export type DocumentType =
  | "Work Order"
  | "Purchase Order"
  | "Techno Commercial Proposal"
  | "Technical Proposal"
  | "Contract Agreement"
  | "Letter of Intent"
  | "Service Order"
  | "Quotation"
  | "Tender"
  | "Engineering Proposal"
  | "Unknown";

interface ClassifierRule {
  docType: DocumentType;
  /** [keyword/phrase, weight] — matched case-insensitively anywhere in the document; heading-area matches (see classifyDocument) count extra. */
  signals: Array<[string, number]>;
}

const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    docType: "Techno Commercial Proposal",
    signals: [
      ["techno-commercial proposal", 10],
      ["techno commercial proposal", 10],
      ["technical and commercial proposal", 8],
      ["proposed costing", 4],
      ["scope of work", 2],
      ["terms & conditions", 2],
      ["payment terms", 2],
      ["validity", 2],
    ],
  },
  {
    docType: "Technical Proposal",
    signals: [
      ["technical proposal", 9],
      ["methodology", 3],
      ["deliverables", 2],
      ["schedule", 2],
    ],
  },
  {
    docType: "Engineering Proposal",
    signals: [
      ["engineering proposal", 9],
      ["engineering services proposal", 9],
      ["scope of engineering", 4],
      ["deliverables", 2],
    ],
  },
  {
    docType: "Work Order",
    signals: [
      ["work order", 10],
      ["w.o. number", 6],
      ["wo no", 5],
      ["employer", 4],
      ["order date", 3],
      ["scope of work", 2],
    ],
  },
  {
    docType: "Purchase Order",
    signals: [
      ["purchase order", 10],
      ["po number", 6],
      ["po no", 5],
      ["vendor", 4],
      ["buyer", 3],
      ["delivery schedule", 2],
    ],
  },
  {
    docType: "Service Order",
    signals: [
      ["service order", 10],
      ["service order no", 6],
      ["service description", 3],
    ],
  },
  {
    docType: "Contract Agreement",
    signals: [
      ["contract agreement", 10],
      ["this agreement", 6],
      ["party of the first part", 5],
      ["party of the second part", 5],
      ["witnesseth", 4],
      ["indemnity", 2],
    ],
  },
  {
    docType: "Letter of Intent",
    signals: [
      ["letter of intent", 10],
      ["loi no", 6],
      ["intent to award", 4],
    ],
  },
  {
    docType: "Quotation",
    signals: [
      ["quotation", 8],
      ["quote no", 5],
      ["price quote", 4],
      ["validity of quotation", 3],
    ],
  },
  {
    docType: "Tender",
    signals: [
      ["tender", 8],
      ["tender no", 6],
      ["bid document", 4],
      ["bidder", 3],
      ["earnest money deposit", 3],
      ["emd", 2],
    ],
  },
];

export interface DocumentClassification {
  docType: DocumentType;
  confidence: number;
  matchedSignals: string[];
}

/** Only the first ~2000 characters (roughly the title page + first heading) count as "heading area" — a signal found there is far more reliable than the same phrase buried on page 30. */
const HEADING_AREA_CHARS = 2000;
const HEADING_AREA_BONUS = 1.5;

export function classifyDocument(fullText: string): DocumentClassification {
  const lower = fullText.toLowerCase();
  const headingArea = lower.slice(0, HEADING_AREA_CHARS);

  let best: DocumentClassification = { docType: "Unknown", confidence: 0, matchedSignals: [] };

  for (const rule of CLASSIFIER_RULES) {
    let score = 0;
    const matched: string[] = [];

    for (const [phrase, weight] of rule.signals) {
      const inHeading = headingArea.includes(phrase);
      const inBody = lower.includes(phrase);
      if (!inHeading && !inBody) continue;

      score += inHeading ? weight * HEADING_AREA_BONUS : weight;
      matched.push(phrase);
    }

    if (score > best.confidence) {
      best = { docType: rule.docType, confidence: score, matchedSignals: matched };
    }
  }

  // A weak score isn't a confident classification — fall back to Unknown
  // rather than force-fitting a document into the wrong template profile.
  if (best.confidence < 4) {
    return { docType: "Unknown", confidence: 0, matchedSignals: [] };
  }

  return best;
}
