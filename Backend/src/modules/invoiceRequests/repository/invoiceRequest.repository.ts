import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * Repository — Prisma access only, no business rules (mirrors every other
 * module's repository layer, e.g. prRequest.repository.ts).
 */

const DISPLAY_SELECT = { select: { id: true, fullName: true, email: true } } as const;

function withDisplayRelations() {
  return {
    requestedBy: DISPLAY_SELECT,
    assignedTo: DISPLAY_SELECT,
    project: {
      select: { id: true, prNo: true, client: true, projectTitle: true, eicName: true, contactNumber: true, emailId: true },
    },
  };
}

export interface CreateInvoiceRequestData {
  projectId: string;
  requestedByUserId: string;
  assignedToUserId: string;
  invoiceAmountNote: string | null;
  copiesRequired: string | null;
  drawingsAvailable: string | null;
  printingDetails: string | null;
  address: string | null;
  notes: string | null;
}

export function createInvoiceRequest(tx: Prisma.TransactionClient, data: CreateInvoiceRequestData) {
  return tx.invoiceRequest.create({ data, include: withDisplayRelations() });
}

export function findInvoiceRequestById(id: string) {
  return prisma.invoiceRequest.findUnique({ where: { id }, include: withDisplayRelations() });
}

export function findInvoiceRequestsForProject(projectId: string) {
  return prisma.invoiceRequest.findMany({
    where: { projectId },
    include: withDisplayRelations(),
    orderBy: { createdAt: "desc" },
  });
}

/** Duplicate-submission guard — see invoiceRequest.service.ts's createInvoiceRequest() for the advisory-locked transaction this runs inside. */
export function findOpenInvoiceRequestForProject(tx: Prisma.TransactionClient, projectId: string) {
  return tx.invoiceRequest.findFirst({ where: { projectId, status: "Open" } });
}

export function findOpenInvoiceRequestsForProject(projectId: string) {
  return prisma.invoiceRequest.findMany({
    where: { projectId, status: "Open" },
    include: withDisplayRelations(),
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Atomic claim-ticket — same conditional-UPDATE concurrency pattern as
 * prRequest.repository.ts's claimStatusTransition(): only one caller can ever
 * complete a given still-Open request, and a retried/duplicate fulfillment
 * attempt is a harmless no-op (count === 0).
 */
export function claimInvoiceRequestCompletion(id: string, fulfilledInvoiceLineId: string | null) {
  return prisma.invoiceRequest.updateMany({
    where: { id, status: "Open" },
    data: { status: "Completed", fulfilledInvoiceLineId },
  });
}
