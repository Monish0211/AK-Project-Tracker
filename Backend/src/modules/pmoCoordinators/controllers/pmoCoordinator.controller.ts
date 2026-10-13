import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as service from "../services/pmoCoordinator.service.js";
import { pmoCoordinatorIdParamSchema } from "../validators/pmoCoordinator.validators.js";
import type { CreatePmoCoordinatorInput, UpdatePmoCoordinatorInput } from "../validators/pmoCoordinator.validators.js";

function parseIdParam(req: Request): string {
  const result = pmoCoordinatorIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("PMO Coordinator ID is required.", 400);
  }
  return result.data.id;
}

export const getPmoCoordinators = asyncHandler(async (_req: Request, res: Response) => {
  const items = await service.listPmoCoordinators();
  res.status(200).json({ success: true, data: { items } });
});

/** GET /projects/pmo-coordinators — the General Information picker (any Projects-module user). */
export const getPmoCoordinatorOptions = asyncHandler(async (_req: Request, res: Response) => {
  const items = await service.listPmoCoordinatorOptions();
  res.status(200).json({ success: true, data: { items } });
});

export const createPmoCoordinator = asyncHandler(async (req: Request, res: Response) => {
  const coordinator = await service.createPmoCoordinator(req.body as CreatePmoCoordinatorInput, req.user!.sub);
  res.status(201).json({ success: true, data: coordinator, message: "PMO Coordinator added successfully." });
});

export const updatePmoCoordinator = asyncHandler(async (req: Request, res: Response) => {
  const coordinator = await service.updatePmoCoordinator(parseIdParam(req), req.body as UpdatePmoCoordinatorInput);
  res.status(200).json({ success: true, data: coordinator, message: "PMO Coordinator updated successfully." });
});

export const deletePmoCoordinator = asyncHandler(async (req: Request, res: Response) => {
  await service.removePmoCoordinator(parseIdParam(req));
  res.status(200).json({ success: true, message: "PMO Coordinator removed successfully." });
});
