import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as quantityService from "../services/quantity.service.js";
import { projectIdParamSchema, quantityIdParamSchema } from "../validators/quantity.validators.js";
import type { CreateQuantityInput, UpdateQuantityInput } from "../validators/quantity.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as getProjects()'s query parsing
// in project.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseQuantityIdParam(req: Request): string {
  const result = quantityIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Quantity ID is required.", 400);
  }
  return result.data.id;
}

export const createQuantity = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const quantity = await quantityService.createQuantityForProject(projectId, req.body as CreateQuantityInput, user);
  res.status(201).json({ success: true, data: quantity, message: "Quantity item created successfully." });
});

export const getQuantityByProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await quantityService.listQuantityForProject(projectId, user);
  res.status(200).json({ success: true, data: result });
});

export const updateQuantity = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseQuantityIdParam(req);
  const quantity = await quantityService.updateQuantityItem(id, req.body as UpdateQuantityInput, user);
  res.status(200).json({ success: true, data: quantity, message: "Quantity item updated successfully." });
});

export const deleteQuantity = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseQuantityIdParam(req);
  await quantityService.deleteQuantityItem(id, user);
  res.status(200).json({ success: true, data: null, message: "Quantity item deleted successfully." });
});
