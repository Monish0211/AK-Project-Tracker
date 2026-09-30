import { prisma } from "../../../shared/utils/prismaClient.js";

const displayFields = {
  id: true,
  fileName: true,
  mimeType: true,
  fileSizeBytes: true,
  createdAt: true,
  uploadedByUserId: true,
  uploadedBy: { select: { fullName: true } },
} as const;

export function createDocument(data: {
  projectId?: string | null;
  prRequestId?: string | null;
  customerId?: string | null;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedByUserId: string;
}) {
  return prisma.document.create({
    data: {
      projectId: data.projectId ?? null,
      prRequestId: data.prRequestId ?? null,
      customerId: data.customerId ?? null,
      fileName: data.fileName,
      storageKey: data.storageKey,
      mimeType: data.mimeType,
      fileSizeBytes: data.fileSizeBytes,
      uploadedByUserId: data.uploadedByUserId,
    },
    select: displayFields,
  });
}

/**
 * Customer GST Document (Sep 2026) — at most one row, since
 * Document.customerId is @unique (one GST document per customer for this
 * release). Used to find-and-replace on re-upload — see
 * document.service.ts's uploadDocumentForCustomer().
 */
export function findDocumentByCustomerId(customerId: string) {
  return prisma.document.findUnique({ where: { customerId } });
}

export function findDocumentsByProjectId(projectId: string) {
  return prisma.document.findMany({
    where: { projectId },
    select: displayFields,
    orderBy: { createdAt: "desc" },
  });
}

export function findDocumentsByPRRequestId(prRequestId: string) {
  return prisma.document.findMany({
    where: { prRequestId },
    select: displayFields,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Full row (including storageKey/projectId/prRequestId) — ONLY for the
 * download and delete code paths, which must re-check authorization against
 * the row's CURRENT parent before ever touching the filesystem. Never
 * exposed to any list/display endpoint — see document.service.ts.
 */
export function findDocumentById(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export function deleteDocumentRow(id: string) {
  return prisma.document.delete({ where: { id } });
}

/**
 * PR approval hook — re-points every document still attached to this PR
 * Request onto the newly created Project. A plain conditional updateMany,
 * not a copy: the physical file never moves, only the FK does. Naturally
 * idempotent — a second call matches zero rows, since prRequestId is
 * already NULL for anything already re-pointed — on top of the outer
 * claim-ticket guard in pmoManagerApprove() that already prevents this from
 * running twice for one approval. See that function's own comment for the
 * exact call site.
 */
export function repointDocumentsToProject(prRequestId: string, projectId: string) {
  return prisma.document.updateMany({
    where: { prRequestId, projectId: null },
    data: { projectId, prRequestId: null },
  });
}
