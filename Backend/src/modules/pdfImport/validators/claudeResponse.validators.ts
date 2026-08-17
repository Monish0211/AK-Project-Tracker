import { z } from "zod";

/**
 * Validates Claude's raw text response. Per Stage 4 Correction 1: partial
 * tolerance is a property of the SCHEMA SHAPE, not of how safeParse()
 * behaves — every extraction field below is individually
 * .nullable().optional(), so a response where Claude found only some
 * fields still parses successfully as a whole. A genuinely malformed
 * response (invalid JSON, or a shape that doesn't resemble this structure
 * at all — e.g. "quantity" being a string instead of an array) is a
 * DIFFERENT, total failure, distinguished explicitly in
 * parseClaudeRawResponse()'s return shape rather than conflated with "some
 * fields are empty."
 */

const nullableString = () => z.string().nullable().optional();
const nullableNumber = () => z.number().nullable().optional();

export const claudeGeneralInformationSchema = z.object({
  poMonth: nullableString(),
  prCategory: nullableString(),
  projectTitle: nullableString(),
  client: nullableString(),
  department: nullableString(),
  domesticForeign: nullableString(),
  workOrderStatus: nullableString(),
  projectStatus: nullableString(),
  projectStartDate: nullableString(),
  projectEndDate: nullableString(),
  estimatedDuration: nullableNumber(),
  durationUnit: nullableString(),
  workOrderNumber: nullableString(),
  workOrderDate: nullableString(),
  eicName: nullableString(),
  contactNumber: nullableString(),
  emailId: nullableString(),
  contractType: nullableString(),
  pmoCoordinator: nullableString(),
  workOrderValue: nullableNumber(),
  currency: nullableString(),
});

export const claudeQuantityRowSchema = z.object({
  description: nullableString(),
  qty: nullableNumber(),
  uom: nullableString(),
  unitRate: nullableNumber(),
});

export const claudeMilestoneSchema = z.object({
  milestoneName: nullableString(),
  paymentPercentage: nullableNumber(),
  dueDate: nullableString(),
});

export const claudeExtractionSchema = z.object({
  generalInformation: claudeGeneralInformationSchema.nullable().optional(),
  quantity: z.array(claudeQuantityRowSchema).nullable().optional(),
  paymentMilestones: z.array(claudeMilestoneSchema).nullable().optional(),
});

export type ClaudeGeneralInformation = z.infer<typeof claudeGeneralInformationSchema>;
export type ClaudeQuantityRow = z.infer<typeof claudeQuantityRowSchema>;
export type ClaudeMilestone = z.infer<typeof claudeMilestoneSchema>;
export type ClaudeExtractionResult = z.infer<typeof claudeExtractionSchema>;

export interface ParsedClaudeResponse {
  ok: boolean;
  data?: ClaudeExtractionResult;
  /** Set only when ok=false — a TOTAL failure (bad JSON or wrong top-level shape), never set for "just some fields were null." */
  failureReason?: string;
}

/**
 * Two distinct outcomes, deliberately not conflated:
 *  - ok:false  → total failure (invalid JSON, or a shape that doesn't
 *    resemble this structure at all). Caller (the controller) falls back
 *    to "Claude unavailable" for the whole request.
 *  - ok:true   → parsed successfully, REGARDLESS of how many individual
 *    fields came back null/absent — that's normal, expected candidate
 *    data with gaps, not an error.
 */
export function parseClaudeRawResponse(rawText: string): ParsedClaudeResponse {
  let json: unknown;
  try {
    // Claude occasionally wraps JSON in markdown fences despite the prompt
    // asking it not to — strip a leading/trailing ``` fence defensively
    // rather than failing the whole response over a formatting quirk.
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, failureReason: "Claude response was not valid JSON." };
  }

  const result = claudeExtractionSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, failureReason: "Claude response did not match the expected structure." };
  }

  return { ok: true, data: result.data };
}
