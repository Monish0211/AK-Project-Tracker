import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/** `client` lets the completion audit note commit in the same transaction as the completion itself. */
export function createProjectNote(projectId: string, data: { message: string; createdBy: string }, client: typeof prisma | Prisma.TransactionClient = prisma) {
  return client.projectNote.create({
    data: {
      projectId,
      message: data.message,
      createdBy: data.createdBy,
    },
  });
}

export function getProjectNotesByProjectId(projectId: string) {
  return prisma.projectNote.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}

export function getProjectNoteById(id: string) {
  return prisma.projectNote.findUnique({ where: { id } });
}

/**
 * Sept 2026 — dedicated read-only Notes register page. One batched query
 * for every note across a caller-authorized project id list (never one
 * query per project) — distinct from dashboard.repository.ts's own
 * findNotesForProjects(), which is capped at 40 rows for a "recent
 * activity" widget and is not reused here since this page must show every
 * note, not a recent-activity sample. Includes each note's parent
 * project's prNo (a single join, not a second round trip) so the Notes
 * page never needs to separately look up which project a note belongs to.
 * Read-only — does not touch note create/update/delete behavior at all.
 */
export function getAllNotesForProjectIds(projectIds: string[]) {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.projectNote.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      id: true,
      projectId: true,
      message: true,
      createdBy: true,
      createdAt: true,
      project: { select: { prNo: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
