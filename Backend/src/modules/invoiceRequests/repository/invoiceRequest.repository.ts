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
    // CC Members (Oct 2026) — the persisted PortalUsers selected as CC
    // recipients at submission time. Always eager-loaded alongside
    // requestedBy/assignedTo since every caller of this shape (the create
    // response, the Raised-fulfillment lookup, the Paid lookup) needs the
    // same persisted set to compose the lifecycle's CC list — see
    // invoiceRequestEmail.rules.ts's buildInvoiceWorkflowCcList().
    ccMembers: { include: { portalUser: DISPLAY_SELECT } },
    // Attachments (Oct 2026) — the files uploaded with the request. storageKey is internal: it is read by the email sender to
    // locate the stored file and is never put on the DTO.
    documents: {
      select: { id: true, fileName: true, mimeType: true, fileSizeBytes: true, storageKey: true },
      orderBy: { createdAt: "asc" as const },
    },
  };
}

/** One already-stored attachment file, ready to be recorded against the new request. */
export interface CreateInvoiceRequestDocumentData {
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedByUserId: string;
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
  /** Already-validated, already-deduped active PortalUser ids — see invoiceRequest.service.ts's createInvoiceRequest(). */
  ccMemberUserIds: string[];
  /** Attachments (Oct 2026) — files already written to storage; their metadata rows are created in the same transaction as the request. */
  documents: CreateInvoiceRequestDocumentData[];
}

export function createInvoiceRequest(tx: Prisma.TransactionClient, data: CreateInvoiceRequestData) {
  const { ccMemberUserIds, documents, ...requestData } = data;
  return tx.invoiceRequest.create({
    data: {
      ...requestData,
      // Every new request starts "pending" — the notification email is sent after this transaction commits.
      emailStatus: "pending",
      emailUpdatedAt: new Date(),
      ccMembers: { create: ccMemberUserIds.map((portalUserId) => ({ portalUserId })) },
      ...(documents.length > 0 ? { documents: { create: documents } } : {}),
    },
    include: withDisplayRelations(),
  });
}

/** Records how the notification email ended. Only ever moves a request off "pending" (or between final outcomes after a retry). */
export function updateInvoiceRequestEmailOutcome(id: string, emailStatus: string, emailDetail: string | null) {
  return prisma.invoiceRequest.update({
    where: { id },
    data: { emailStatus, emailDetail, emailUpdatedAt: new Date() },
    select: { id: true },
  });
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
 * Project Repository — Invoice lifecycle status (Oct 2026). Batched (one
 * query for an entire Repository page, never one per project) — backs
 * project.service.ts's computeCommercialTotalsByProjectId(), which already
 * batches QuantityItem/InvoiceLine totals the identical way. Narrow
 * {projectId}-only select, same minimal-shape convention as
 * findActiveUsersByIds() etc. elsewhere in this codebase.
 */
export function findOpenInvoiceRequestProjectIds(projectIds: string[]): Promise<{ projectId: string }[]> {
  if (projectIds.length === 0) return Promise.resolve([]);
  return prisma.invoiceRequest.findMany({
    where: { projectId: { in: projectIds }, status: "Open" },
    select: { projectId: true },
  });
}

/**
 * Invoice Paid — finds the (at most one, enforced by
 * InvoiceRequest.fulfilledInvoiceLineId's own @@unique) InvoiceRequest that
 * this exact InvoiceLine fulfilled, if any. An InvoiceLine raised outside
 * the Request Invoice workflow (no request ever pointed at it) correctly
 * returns null — see invoiceRequest.service.ts's notifyInvoicePaidIfLinked()
 * for why that is a silent no-op, never an error.
 */
export function findInvoiceRequestByFulfilledLineId(invoiceLineId: string) {
  return prisma.invoiceRequest.findUnique({
    where: { fulfilledInvoiceLineId: invoiceLineId },
    include: withDisplayRelations(),
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
