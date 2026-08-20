import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as projectService from "../services/project.service.js";
import { listProjectsQuerySchema } from "../validators/project.validators.js";
import type { CreateProjectInput, ImportProjectsInput, UpdateProjectInput } from "../validators/project.validators.js";

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const project = await projectService.createProject(req.body as CreateProjectInput, user.sub);
  res.status(201).json({ success: true, data: project, message: "Project created successfully." });
});

export const importProjects = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await projectService.bulkImportProjects(req.body as ImportProjectsInput, user.sub);
  res.status(201).json({
    success: true,
    data: result,
    message: `${result.items.length} project(s) imported successfully.`,
  });
});

export const getProjects = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  // The shared `validate()` middleware only covers req.body — query params
  // are parsed here, same error-shaping convention as a body validation
  // failure.
  const result = listProjectsQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.";
    throw new AppError(message, 400);
  }

  const page = await projectService.listProjects(result.data, user);
  res.status(200).json({ success: true, data: page });
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const project = await projectService.getProjectById(req.params.id as string, user);
  res.status(200).json({ success: true, data: project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const project = await projectService.updateProject(req.params.id as string, req.body as UpdateProjectInput, user);
  res.status(200).json({ success: true, data: project, message: "Project updated successfully." });
});

/** Archive — reversible. The route path (DELETE /projects/:id) is unchanged; only the name reflects what this has always actually done. */
export const archiveProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await projectService.archiveProject(req.params.id as string, user);
  res.status(200).json({ success: true, data: null, message: "Project archived successfully." });
});

/** Recover — the exact inverse of archiveProject. No special permission, matching Archive's own gate. */
export const restoreProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await projectService.restoreProject(req.params.id as string, user);
  res.status(200).json({ success: true, data: null, message: "Project restored successfully." });
});

/** Permanent Delete — irreversible, gated by "Delete Project Permanently" (see project.routes.ts's requireApprovalPermission gate) AND project-ownership access (checked inside the service). */
export const permanentlyDeleteProject = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await projectService.permanentlyDeleteProject(req.params.id as string, user);
  res.status(200).json({ success: true, data: null, message: "Project permanently deleted." });
});
