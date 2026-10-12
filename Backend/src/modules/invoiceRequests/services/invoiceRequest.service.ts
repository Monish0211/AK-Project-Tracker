import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import { userHasApprovalPermission } from "../../../shared/middleware/requireApprovalPermission.js";
import { findActiveUsersByIds } from "../../users/repository/user.repository.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildInvoiceRaisedSuccessfullyEmail } from "../../../shared/email/templates/invoiceRaisedSuccessfully.template.js";
import { buildInvoiceRequestAssignedEmail } from "../../../shared/email/templates/invoiceRequestAssigned.template.js";
import { buildInvoicePaidEmail } from "../../../shared/email/templates/invoicePaid.template.js";
import { buildInvoiceWorkflowCcList } from "../invoiceRequestEmail.rules.js";
import { notify } from "../../notifications/notification.service.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import type { InvoiceRequestDto } from "../dto/invoiceRequest.dto.js";
import * as repo from "../repository/invoiceRequest.repository.js";
import type { CreateInvoiceRequestInput } from "../validators/invoiceRequest.validators.js";

type InvoiceRequestRow = NonNullable<Awaited<ReturnType<typeof repo.findInvoiceRequestById>>>;

function toInvoiceRequestDto(row: InvoiceRequestRow): InvoiceRequestDto {
  return {
    id: row.id,
    projectId: row.projectId,
    projectPrNo: row.project.prNo,
    projectClient: row.project.client,
    projectTitle: row.project.projectTitle,
    clientContactName: row.project.eicName,
    clientContactPhone: row.project.contactNumber,
    clientContactEmail: row.project.emailId,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedBy.fullName,
    assignedToUserId: row.assignedToUserId,
    assignedToName: row.assignedTo.fullName,
    ccMembers: row.ccMembers.map((m) => ({ id: m.portalUser.id, fullName: m.portalUser.fullName, email: m.portalUser.email })),
    invoiceAmountNote: row.invoiceAmountNote,
    copiesRequired: row.copiesRequired,
    drawingsAvailable: row.drawingsAvailable,
    printingDetails: row.printingDetails,
    address: row.address,
    notes: row.notes,
    status: row.status as InvoiceRequestDto["status"],
    fulfilledInvoiceLineId: row.fulfilledInvoiceLineId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** There is no standalone invoice URL anywhere in the frontend — see notification.service.ts's ENTITY_ROUTE_BUILDERS.Invoice comment. Both notification emails below deep-link straight to the project's own Invoices tab, never a separate Invoice Requests page. */
function projectInvoicesUrl(projectId: string): string {
  return `${env.FRONTEND_URL}/projects/edit/${projectId}`;
}

/** Same hashtext()-keyed advisory lock pattern as invoice.service.ts/milestone.service.ts, scoped to this project — closes the "two concurrent Request Invoice submissions" duplicate race the same way those modules close their own check-then-write races. */
async function lockProjectForInvoiceRequestWrite(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
}

/**
 * Request Invoice — Section A (Requester -> Responsible Person). Any
 * Invoices-module user (whether or not they themselves hold "Raise Invoice")
 * may ask a specific eligible responsible person to raise an invoice for
 * this project. `assignedToUserId` must, at THIS moment, be an active user
 * holding "Raise Invoice" — re-validated here, never trusted from the
 * frontend's own eligibility-filtered dropdown alone (same "never trust the
 * client's picker" precedent as prRequest.service.ts's sendToAccounts()).
 *
 * Duplicate-submission protection: a double-click (or a genuine second
 * request while the first is still pending) is rejected with a 409 while
 * this project already has an Open Invoice Request — enforced inside an
 * advisory-locked transaction (lock, re-check, then insert) so two
 * concurrent submissions can never both pass the check, per the user's own
 * "backend atomic protection similar to the PR Request assignment pattern"
 * requirement (see prRequest.repository.ts's claimDraftForSendToAccounts()
 * for that precedent's conditional-UPDATE shape — an advisory lock is the
 * correct equivalent here since this is a check-then-INSERT, not a
 * transition of an already-existing row).
 */
export async function createInvoiceRequest(
  projectId: string,
  input: CreateInvoiceRequestInput,
  requester: AccessTokenPayload
): Promise<InvoiceRequestDto> {
  await assertProjectAccessById(projectId, requester);

  const isEligible = await userHasApprovalPermission(input.assignedToUserId, ["Raise Invoice"]);
  if (!isEligible) {
    throw new AppError("The selected person does not currently hold the Raise Invoice permission.", 400);
  }

  // CC Members (Oct 2026) — never trust the frontend-selected ids as-is.
  // Dedupe first (a double-click or a stray duplicate in the payload must
  // never produce two InvoiceRequestCcMember rows for the same person —
  // @@unique would reject it anyway, but failing the whole request on that
  // is unnecessary), then re-validate every id is a real, currently-active
  // PortalUser; anything else is silently dropped, never persisted, never
  // emailed — same "never trust the client's picker" precedent as
  // assignedToUserId directly above.
  const requestedCcIds = Array.from(new Set(input.ccMemberUserIds ?? []));
  const validCcUsers = requestedCcIds.length > 0 ? await findActiveUsersByIds(requestedCcIds) : [];
  const ccMemberUserIds = validCcUsers.map((u) => u.id);

  const created = await prisma.$transaction(async (tx) => {
    await lockProjectForInvoiceRequestWrite(tx, projectId);

    const existingOpen = await repo.findOpenInvoiceRequestForProject(tx, projectId);
    if (existingOpen) {
      throw new AppError("An invoice request is already pending for this project.", 409);
    }

    return repo.createInvoiceRequest(tx, {
      projectId,
      requestedByUserId: requester.sub,
      assignedToUserId: input.assignedToUserId,
      invoiceAmountNote: input.invoiceAmountNote ?? null,
      copiesRequired: input.copiesRequired ?? null,
      drawingsAvailable: input.drawingsAvailable ?? null,
      printingDetails: input.printingDetails ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      ccMemberUserIds,
    });
  });

  void notifyAssignedResponsiblePerson(created).catch((error) => {
    console.error("[invoiceRequests] notifyAssignedResponsiblePerson failed:", error instanceof Error ? error.message : error);
  });

  return toInvoiceRequestDto(created);
}

export async function listInvoiceRequestsForProject(
  projectId: string,
  user: AccessTokenPayload
): Promise<InvoiceRequestDto[]> {
  await assertProjectAccessById(projectId, user);
  const rows = await repo.findInvoiceRequestsForProject(projectId);
  return rows.map(toInvoiceRequestDto);
}

async function notifyAssignedResponsiblePerson(request: InvoiceRequestRow): Promise<void> {
  const requesterName = request.requestedBy.fullName;

  await notify([request.assignedToUserId], {
    title: "Invoice Request — please raise this invoice",
    message: `${requesterName} requested that you raise the invoice for ${request.project.projectTitle} (PR ${request.project.prNo}).`,
    type: "INVOICE_REQUEST_ASSIGNED",
    severity: "Medium",
    entityType: "Invoice",
    entityId: request.projectId,
  });

  try {
    const email = buildInvoiceRequestAssignedEmail({
      assignedToName: request.assignedTo.fullName,
      requesterName,
      prNo: request.project.prNo,
      projectTitle: request.project.projectTitle,
      client: request.project.client,
      clientContactName: request.project.eicName,
      clientContactPhone: request.project.contactNumber,
      clientContactEmail: request.project.emailId,
      invoiceAmountNote: request.invoiceAmountNote,
      copiesRequired: request.copiesRequired,
      drawingsAvailable: request.drawingsAvailable,
      printingDetails: request.printingDetails,
      address: request.address,
      notes: request.notes,
      invoicesUrl: projectInvoicesUrl(request.projectId),
    });
    const cc = buildInvoiceWorkflowCcList(request.ccMembers.map((m) => m.portalUser.email));
    const result = await sendEmail({ to: request.assignedTo.email, cc, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[invoiceRequests] Assigned email failed for ${request.assignedTo.email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "[invoiceRequests] Unexpected error while sending Assigned email:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Section B — "Invoice Successfully Raised" (Responsible Person ->
 * Requester, automatic). Called ONLY from invoice.service.ts, ONLY
 * immediately after a real InvoiceLine has actually been saved with status
 * "Raised" (never before the save succeeds, and never for a Draft/Cancelled
 * save) — see that file's two call sites (creation with status Raised; a
 * PATCH that transitions an existing line's status TO Raised) for exactly
 * which events qualify.
 *
 * Fulfills every currently-Open Invoice Request tied to this project: the
 * event "an invoice was raised for this project" genuinely satisfies every
 * pending ask about it, not just the one addressed to whoever happened to
 * raise it. Only the OLDEST Open request records the fulfilling
 * InvoiceLine's own id (fulfilledInvoiceLineId is unique per schema.prisma —
 * only one request can ever claim a given line); any additional Open
 * requests for the same project are still marked Completed, just without
 * that particular link. claimInvoiceRequestCompletion() is a conditional
 * UPDATE keyed on status = "Open", so a concurrent/duplicate call for the
 * same request is a harmless no-op.
 */
export async function fulfillOpenInvoiceRequestsForProject(projectId: string, invoiceLineId: string): Promise<void> {
  const openRequests = await repo.findOpenInvoiceRequestsForProject(projectId);
  if (openRequests.length === 0) return;

  for (const [index, request] of openRequests.entries()) {
    const fulfilledInvoiceLineId = index === 0 ? invoiceLineId : null;
    const claimed = await repo.claimInvoiceRequestCompletion(request.id, fulfilledInvoiceLineId);
    if (claimed.count === 0) continue;

    void notifyRequesterInvoiceRaised(request).catch((error) => {
      console.error("[invoiceRequests] notifyRequesterInvoiceRaised failed:", error instanceof Error ? error.message : error);
    });
  }
}

async function notifyRequesterInvoiceRaised(request: InvoiceRequestRow): Promise<void> {
  await notify([request.requestedByUserId], {
    title: "Your requested invoice has been raised",
    message: `The invoice you requested for ${request.project.projectTitle} (PR ${request.project.prNo}) has been successfully raised.`,
    type: "INVOICE_REQUEST_FULFILLED",
    severity: "Info",
    entityType: "Invoice",
    entityId: request.projectId,
  });

  try {
    const email = buildInvoiceRaisedSuccessfullyEmail({
      requesterName: request.requestedBy.fullName,
      prNo: request.project.prNo,
      projectTitle: request.project.projectTitle,
      invoicesUrl: projectInvoicesUrl(request.projectId),
    });
    const cc = buildInvoiceWorkflowCcList(request.ccMembers.map((m) => m.portalUser.email));
    const result = await sendEmail({ to: request.requestedBy.email, cc, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[invoiceRequests] Fulfilled email failed for ${request.requestedBy.email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "[invoiceRequests] Unexpected error while sending Fulfilled email:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Invoice Paid (Oct 2026) — the third and final stage of the Request Invoice
 * -> Invoice Raised -> Invoice Paid lifecycle. Called ONLY from
 * invoice.service.ts's updateInvoiceLine(), ONLY on a genuine
 * previous-status-!=-Paid -> Paid transition (see invoiceRequestEmail.rules.ts's
 * isGenuinePaidTransition() — the guard lives there/at the call site, not
 * here, so this function's own contract is simply "notify for this line,
 * now"). A silent no-op when this InvoiceLine was never the one that
 * fulfilled an InvoiceRequest (raised outside this workflow entirely) — there
 * is no "original requester" to notify in that case, by design, not an
 * oversight.
 */
export async function notifyInvoicePaidIfLinked(
  invoiceLineId: string,
  invoiceLine: {
    invoiceNo: string;
    invoiceAmountINR: number;
    currency?: string | undefined;
    invoiceAmountOriginal?: number | null | undefined;
    exchangeRateToINR?: number | undefined;
  }
): Promise<void> {
  const invoiceRequest = await repo.findInvoiceRequestByFulfilledLineId(invoiceLineId);
  if (!invoiceRequest) return;

  await notify([invoiceRequest.requestedByUserId], {
    title: "Invoice Paid",
    message: `Invoice ${invoiceLine.invoiceNo} for ${invoiceRequest.project.projectTitle} (PR ${invoiceRequest.project.prNo}) has been marked as Paid.`,
    type: "INVOICE_PAID",
    severity: "Info",
    entityType: "Invoice",
    entityId: invoiceRequest.projectId,
  });

  try {
    const email = buildInvoicePaidEmail({
      requesterName: invoiceRequest.requestedBy.fullName,
      prNo: invoiceRequest.project.prNo,
      projectTitle: invoiceRequest.project.projectTitle,
      client: invoiceRequest.project.client,
      invoiceNo: invoiceLine.invoiceNo,
      invoiceAmountINR: invoiceLine.invoiceAmountINR,
      invoiceCurrency: invoiceLine.currency,
      invoiceAmountOriginal: invoiceLine.invoiceAmountOriginal,
      exchangeRateToINR: invoiceLine.exchangeRateToINR,
      invoicesUrl: projectInvoicesUrl(invoiceRequest.projectId),
    });
    const cc = buildInvoiceWorkflowCcList(invoiceRequest.ccMembers.map((m) => m.portalUser.email));
    const result = await sendEmail({ to: invoiceRequest.requestedBy.email, cc, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[invoiceRequests] Paid email failed for ${invoiceRequest.requestedBy.email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "[invoiceRequests] Unexpected error while sending Paid email:",
      error instanceof Error ? error.message : error
    );
  }
}
