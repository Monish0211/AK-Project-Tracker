import { prisma } from "../../../shared/utils/prismaClient.js";

export function createProjectNote(projectId: string, data: { message: string; createdBy: string }) {
  return prisma.projectNote.create({
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
