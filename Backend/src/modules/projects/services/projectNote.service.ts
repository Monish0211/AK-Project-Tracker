import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { createProjectNote, getProjectNotesByProjectId } from "../repository/projectNote.repository.js";

export async function getNotesForProjectService(projectId: string, user?: AccessTokenPayload) {
  if (user) {
    await assertProjectAccessById(projectId, user);
  }
  const notes = await getProjectNotesByProjectId(projectId);
  return notes.map((note) => ({
    id: note.id,
    projectId: note.projectId,
    message: note.message,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
  }));
}

export async function createNoteForProjectService(
  projectId: string,
  data: { message?: string; createdBy?: string },
  user?: AccessTokenPayload
) {
  if (user) {
    await assertProjectAccessById(projectId, user);
  }

  const message = data.message?.trim();
  if (!message) {
    throw new AppError("Note message is required and cannot be empty", 400);
  }

  const createdBy = data.createdBy?.trim() || "Administrator";

  const note = await createProjectNote(projectId, { message, createdBy });
  return {
    id: note.id,
    projectId: note.projectId,
    message: note.message,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
  };
}
