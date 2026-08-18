import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import * as projectService from "../services/project.service.js";
import { listProjectsQuerySchema } from "../validators/project.validators.js";
import type {
  CreateProjectInput,
  ImportProjectsInput,
  PermanentDeleteProjectInput,
  UpdateProjectInput,
} from "../validators/project.validators.js";

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

  // timesheetCleanup is only ever present when this call just transitioned
  // the Project into Completed (see project.service.ts's isNewlyCompleted)
  // — every other save keeps the plain message unchanged.
  let message = "Project updated successfully.";
  if (project.timesheetCleanup) {
    const { deletedTimesheetEntries } = project.timesheetCleanup;
    message =
      deletedTimesheetEntries > 0
        ? `Project completed successfully. ${deletedTimesheetEntries} Timesheet record${deletedTimesheetEntries === 1 ? "" : "s"} ${deletedTimesheetEntries === 1 ? "was" : "were"} removed.`
        : "Project completed successfully. No Timesheet records were found for this Project.";
  }

  res.status(200).json({ success: true, data: project, message });
});

/** Archive — reversible. The route path (DELETE /projects/:id) is unchanged; only the name reflects what this has always actually done. */
export const archiveProject = asyncHandler(async (req: Request, res: Response) => {
  await projectService.archiveProject(req.params.id as string);
  res.status(200).json({ success: true, data: null, message: "Project archived successfully." });
});

/** Permanent Delete — irreversible, Administrator-only (see project.routes.ts's authorize("Administrator") gate). */
export const permanentlyDeleteProject = asyncHandler(async (req: Request, res: Response) => {
  const { hasInvoiceHistory } = req.body as PermanentDeleteProjectInput;
  await projectService.permanentlyDeleteProject(req.params.id as string, hasInvoiceHistory);
  res.status(200).json({ success: true, data: null, message: "Project permanently deleted." });
});
