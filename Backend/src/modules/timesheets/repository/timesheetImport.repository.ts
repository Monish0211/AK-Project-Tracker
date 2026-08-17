import { prisma } from "../../../shared/utils/prismaClient.js";

/** All Prisma access for TimesheetImport (the audit header record) lives here. */

export interface TimesheetImportCreateData {
  emailMessageId?: string | null;
  attachmentId?: string | null;
  attachmentFilename?: string | null;
  receivedAt?: Date | null;
  triggeredBy: string;
  uploadedByUserId?: string | null;
}

/** status starts "Processing" — created only once the attachment/file bytes are already fully in hand (see mailPoll.service.ts / the manual-upload controller), so a download failure never leaves a stray "Pending" row with nothing to show for it. */
export function createImport(data: TimesheetImportCreateData) {
  return prisma.timesheetImport.create({
    data: { ...data, status: "Processing", processingStartedAt: new Date() },
  });
}

/** The duplicate-email guard — a different concern from row-level reconciliation (see schema.prisma's TimesheetImport model comment). */
export function findImportByEmailMessageId(emailMessageId: string) {
  return prisma.timesheetImport.findUnique({ where: { emailMessageId } });
}

export function findImportById(id: string) {
  return prisma.timesheetImport.findUnique({ where: { id } });
}

export interface TimesheetImportFinalizeData {
  status: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  removedCount: number;
  failedCount: number;
  errorSummary?: string | null;
}

export function finalizeImport(id: string, data: TimesheetImportFinalizeData) {
  return prisma.timesheetImport.update({
    where: { id },
    data: { ...data, processingFinishedAt: new Date() },
  });
}

export function listImports(status: string | undefined, page: number, pageSize: number) {
  const where = status ? { status } : {};
  return Promise.all([
    prisma.timesheetImport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.timesheetImport.count({ where }),
  ]);
}
