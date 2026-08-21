import type { Request, Response, NextFunction } from "express";
import { requireUser } from "../../../shared/utils/requireUser.js";
import { createNoteForProjectService, getNotesForProjectService } from "../services/projectNote.service.js";

export async function getProjectNotesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(req);
    const { projectId } = req.params as { projectId: string };
    const notes = await getNotesForProjectService(projectId, user);
    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    next(error);
  }
}

export async function createProjectNoteController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = requireUser(req);
    const { projectId } = req.params as { projectId: string };
    const authorName = req.body?.createdBy || user.email.split("@")[0] || "Administrator";
    const note = await createNoteForProjectService(
      projectId,
      {
        message: req.body?.message,
        createdBy: authorName,
      },
      user
    );
    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
}
