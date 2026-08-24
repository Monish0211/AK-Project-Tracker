import { z } from "zod";

/**
 * POST /projects/:projectId/notes — createdBy is deliberately NOT accepted
 * here; it is always derived server-side from the authenticated caller (see
 * projectNote.controller.ts), never trusted from the request body.
 */
export const createProjectNoteSchema = z.object({
  message: z.string().trim().min(1, "Note message is required.").max(4000, "Note message is too long."),
});

export type CreateProjectNoteInput = z.infer<typeof createProjectNoteSchema>;
