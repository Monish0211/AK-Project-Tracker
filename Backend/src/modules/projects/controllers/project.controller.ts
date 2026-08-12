import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as projectService from "../services/project.service.js";
import { listProjectsQuerySchema } from "../validators/project.validators.js";
import type { CreateProjectInput, ImportProjectsInput, UpdateProjectInput } from "../validators/project.validators.js";

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.createProject(req.body as CreateProjectInput);
  res.status(201).json({ success: true, data: project, message: "Project created successfully." });
});

export const importProjects = asyncHandler(async (req: Request, res: Response) => {
  const result = await projectService.bulkImportProjects(req.body as ImportProjectsInput);
  res.status(201).json({
    success: true,
    data: result,
    message: `${result.items.length} project(s) imported successfully.`,
  });
});

export const getProjects = asyncHandler(async (req: Request, res: Response) => {
  // The shared `validate()` middleware only covers req.body — query params
  // are parsed here, same error-shaping convention as a body validation
  // failure.
  const result = listProjectsQuerySchema.safeParse(req.query);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Invalid query parameters.";
    throw new AppError(message, 400);
  }

  const page = await projectService.listProjects(result.data);
  res.status(200).json({ success: true, data: page });
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.getProjectById(req.params.id as string);
  res.status(200).json({ success: true, data: project });
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.updateProject(req.params.id as string, req.body as UpdateProjectInput);
  res.status(200).json({ success: true, data: project, message: "Project updated successfully." });
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  await projectService.deleteProject(req.params.id as string);
  res.status(200).json({ success: true, data: null, message: "Project deleted successfully." });
});
