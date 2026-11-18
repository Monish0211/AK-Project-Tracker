import { z } from "zod";
import { uuidParamSchema } from "../../shared/utils/uuidParam.js";

export const regionIdParamSchema = uuidParamSchema("regionId", "Country ID");
export const runIdParamSchema = uuidParamSchema("runId", "Run ID");

/**
 * The rate is parsed and validated by parseInrPerRegionalUnit (manhourCurrency.rules.ts), which owns the rules (positive, at most 6 decimals, never
 * exactly 1), so it is accepted here as a number or numeric string and checked once, in one place.
 */
export const setCountryRateSchema = z.object({
  inrPerRegionalUnit: z.union([z.number(), z.string()]),
  note: z.string().trim().max(500).optional().nullable(),
});
export type SetCountryRateInput = z.infer<typeof setCountryRateSchema>;

export const applyCountryRateSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type ApplyCountryRateInput = z.infer<typeof applyCountryRateSchema>;
