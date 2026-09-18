import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccessById, hasUnrestrictedProjectVisibility } from "../../../shared/utils/projectAccess.js";
import { getUserDisplayName } from "../../../shared/utils/userDisplayName.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { findAuthorizedProjects } from "../../dashboard/repository/dashboard.repository.js";
import {
  createProjectNote,
  getAllNotesForProjectIds,
  getProjectNotesByProjectId,
} from "../repository/projectNote.repository.js";

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

/**
 * GET /projects/notes — the dedicated read-only Notes register page.
 * Reuses the exact same project-visibility rule every other cross-project
 * list already uses (hasUnrestrictedProjectVisibility() +
 * findAuthorizedProjects(), the same functions Reports' invoice bulk-fetch
 * and Dashboard's own KPIs are built from) — never a second, independently
 * -drifting authorization concept for Notes. A note can only ever be
 * returned here if its parent project is already in the caller's
 * authorized set; an unauthorized project's notes are never fetched in the
 * first place, not merely filtered out afterward. Administrator and PMO
 * Manager get every project (callerUserId: undefined), matching every
 * other unrestricted-visibility list in the app.
 */
export async function listAllNotesForCaller(user: AccessTokenPayload) {
  const callerUserId = hasUnrestrictedProjectVisibility(user.roleName) ? undefined : user.sub;
  const projects = await findAuthorizedProjects(callerUserId);
  const prNoByProjectId = new Map(projects.map((p) => [p.id, p.prNo]));

  const notes = await getAllNotesForProjectIds(projects.map((p) => p.id));

  return {
    items: notes.map((note) => ({
      id: note.id,
      projectId: note.projectId,
      prNo: prNoByProjectId.get(note.projectId) ?? note.project.prNo,
      message: note.message,
      createdBy: note.createdBy,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

export async function createNoteForProjectService(
  projectId: string,
  data: { message?: string },
  user: AccessTokenPayload
) {
  await assertProjectAccessById(projectId, user);

  const message = data.message?.trim();
  if (!message) {
    throw new AppError("Note message is required and cannot be empty", 400);
  }

  // Never trusts a client-supplied name — always the current fullName for
  // the authenticated caller, so a note can never be attributed to someone
  // else.
  const createdBy = await getUserDisplayName(user.sub);

  const note = await createProjectNote(projectId, { message, createdBy });
  return {
    id: note.id,
    projectId: note.projectId,
    message: note.message,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
  };
}
