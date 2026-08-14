import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as resourceService from "../services/resource.service.js";
import { employeeNoParamSchema, projectIdParamSchema, resourceIdParamSchema } from "../validators/resource.validators.js";
import type { CreateResourceInput, UpdateResourceInput } from "../validators/resource.validators.js";

// Path params aren't covered by the shared `validate()` middleware (body
// only) — same manual-safeParse convention as quantity.controller.ts.
function parseProjectIdParam(req: Request): string {
  const result = projectIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Project ID is required.", 400);
  }
  return result.data.projectId;
}

function parseResourceIdParam(req: Request): string {
  const result = resourceIdParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Resource ID is required.", 400);
  }
  return result.data.id;
}

function parseEmployeeNoParam(req: Request): string {
  const result = employeeNoParamSchema.safeParse(req.params);
  if (!result.success) {
    throw new AppError("Employee Number is required.", 400);
  }
  return result.data.employeeNo;
}

export const createResource = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const resource = await resourceService.createResourceForProject(projectId, req.body as CreateResourceInput);
  res.status(201).json({ success: true, data: resource, message: "Project resource created successfully." });
});

export const getResourcesByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = parseProjectIdParam(req);
  const result = await resourceService.listResourcesForProject(projectId);
  res.status(200).json({ success: true, data: result });
});

export const getAssignmentsByEmployee = asyncHandler(async (req: Request, res: Response) => {
  const employeeNo = parseEmployeeNoParam(req);
  const result = await resourceService.listResourcesForEmployee(employeeNo);
  res.status(200).json({ success: true, data: result });
});

export const updateResource = asyncHandler(async (req: Request, res: Response) => {
  const id = parseResourceIdParam(req);
  const resource = await resourceService.updateResourceItem(id, req.body as UpdateResourceInput);
  res.status(200).json({ success: true, data: resource, message: "Project resource updated successfully." });
});

export const deleteResource = asyncHandler(async (req: Request, res: Response) => {
  const id = parseResourceIdParam(req);
  await resourceService.deleteResourceItem(id);
  res.status(200).json({ success: true, data: null, message: "Project resource deleted successfully." });
});
