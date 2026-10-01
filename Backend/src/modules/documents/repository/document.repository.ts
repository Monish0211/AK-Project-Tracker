import { prisma } from "../../../shared/utils/prismaClient.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { moveFlatDocumentIntoProjectFolder } from "../../../shared/utils/documentStorage.js";

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
 * Request onto the newly created Project. Naturally idempotent — a second
 * call matches zero rows, since prRequestId is already NULL for anything
 * already re-pointed — on top of the outer claim-ticket guard in
 * pmoManagerApprove() that already prevents this from running twice for one
 * approval. See that function's own comment for the exact call site.
 *
 * PR-number folders (Oct 2026) — Project documents are now physically
 * stored under <storageDir>/<prNo>/<uuid> (see documentStorage.ts), while PR
 * Request documents remain flat (<storageDir>/<uuid>). This hook's target
 * is always a Project, so the physical file IS moved here — out of the flat
 * area and into the target Project's current PR-number folder — before the
 * FK is updated, keeping storage consistent with the new parent. Resolves
 * the list of affected documents first (not a direct updateMany) precisely
 * because it now needs each one's storageKey to move it; the caller
 * (prRequest.service.ts's pmoManagerApprove()) already treats this whole
 * call as best-effort (logs and continues on failure).
 */
export async function repointDocumentsToProject(prRequestId: string, projectId: string): Promise<{ count: number }> {
  const pending = await prisma.document.findMany({
    where: { prRequestId, projectId: null },
    select: { id: true, storageKey: true },
  });
  if (pending.length === 0) {
    return { count: 0 };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { prNo: true } });
  if (!project) {
    throw new AppError("Target Project could not be resolved for document repoint.", 500);
  }

  for (const doc of pending) {
    await moveFlatDocumentIntoProjectFolder(doc.storageKey, project.prNo);
  }

  return prisma.document.updateMany({
    where: { prRequestId, projectId: null },
    data: { projectId, prRequestId: null },
  });
}
