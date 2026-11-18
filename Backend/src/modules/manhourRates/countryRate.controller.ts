import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { AppError } from "../../shared/utils/AppError.js";
import { requireUser } from "../../shared/utils/requireUser.js";
import * as service from "./countryRate.service.js";
import { regionIdParamSchema, runIdParamSchema } from "./countryRate.validators.js";
import type { ApplyCountryRateInput, SetCountryRateInput } from "./countryRate.validators.js";

function parse<T extends z.ZodTypeAny>(schema: T, params: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(params);
  if (!result.success) throw new AppError(message, 400);
  return result.data;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: await service.listCountryConversionRates(requireUser(req)) });
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParamSchema, req.params, "Country ID is required.");
  res.status(200).json({ success: true, data: await service.getCountryRateHistory(regionId, requireUser(req)) });
});

export const legacyReview = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParamSchema, req.params, "Country ID is required.");
  res.status(200).json({ success: true, data: await service.getLegacyReview(regionId, requireUser(req)) });
});

export const createVersion = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParamSchema, req.params, "Country ID is required.");
  const body = req.body as SetCountryRateInput;
  const data = await service.setCountryRate(regionId, { inrPerRegionalUnit: body.inrPerRegionalUnit, note: body.note }, requireUser(req));
  res.status(201).json({ success: true, data, message: "Manpower conversion rate saved as a new version. Existing costs are unchanged until you review and apply it." });
});

export const previewApply = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParamSchema, req.params, "Country ID is required.");
  res.status(200).json({ success: true, data: await service.previewCountryApply(regionId, requireUser(req)) });
});

export const apply = asyncHandler(async (req: Request, res: Response) => {
  const { regionId } = parse(regionIdParamSchema, req.params, "Country ID is required.");
  const data = await service.applyCountryRate(regionId, req.body as ApplyCountryRateInput, requireUser(req));
  res.status(200).json({ success: true, data, message: data.status === "SUCCEEDED" ? "Rate applied to every affected project." : "Rate applied; some projects are still not current and can be retried." });
});

export const openRuns = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { items: await service.listOpenCountryApplyRuns(requireUser(req)) } });
});

export const retry = asyncHandler(async (req: Request, res: Response) => {
  const { runId } = parse(runIdParamSchema, req.params, "Run ID is required.");
  const data = await service.retryCountryApply(runId, requireUser(req));
  res.status(200).json({ success: true, data, message: data.status === "SUCCEEDED" ? "Rate applied to every affected project." : "Retried; some projects are still not current." });
});
