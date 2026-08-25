import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as resourceService from "../services/resource.service.js";
import { employeeNoParamSchema, listResourcesQuerySchema, projectIdParamSchema, resourceIdParamSchema } from "../validators/resource.validators.js";
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
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const resource = await resourceService.createResourceForProject(projectId, req.body as CreateResourceInput, user);
  res.status(201).json({ success: true, data: resource, message: "Project resource created successfully." });
});

export const getAllAuthorizedResources = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  // P2-02 — query params are optional; the shared validate() middleware
  // only covers req.body, same manual-safeParse convention as the path
  // params above.
  const queryResult = listResourcesQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    const firstIssue = queryResult.error.issues[0];
    throw new AppError(firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.", 400);
  }
  const result = await resourceService.listAllAuthorizedResources(user, queryResult.data);
  res.status(200).json({ success: true, data: result });
});

export const getResourcesByProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = parseProjectIdParam(req);
  const result = await resourceService.listResourcesForProject(projectId, user);
  res.status(200).json({ success: true, data: result });
});

export const getAssignmentsByEmployee = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const employeeNo = parseEmployeeNoParam(req);
  const result = await resourceService.listResourcesForEmployee(employeeNo, user);
  res.status(200).json({ success: true, data: result });
});

export const updateResource = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseResourceIdParam(req);
  const resource = await resourceService.updateResourceItem(id, req.body as UpdateResourceInput, user);
  res.status(200).json({ success: true, data: resource, message: "Project resource updated successfully." });
});

export const deleteResource = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = parseResourceIdParam(req);
  await resourceService.deleteResourceItem(id, user);
  res.status(200).json({ success: true, data: null, message: "Project resource deleted successfully." });
});
