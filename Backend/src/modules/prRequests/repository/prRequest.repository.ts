import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * Repository — Prisma access only, no business rules (mirrors every other
 * module's repository layer, e.g. project.repository.ts). Every read that
 * feeds a DTO includes the display-name relations it needs so the service
 * layer never has to issue a second round-trip just to show a name.
 */

const REQUESTER_SELECT = { select: { id: true, fullName: true, email: true } } as const;

function withDisplayRelations() {
  return {
    requestedBy: REQUESTER_SELECT,
    assignedAccountsApprover: REQUESTER_SELECT,
    assignedPmoManager: REQUESTER_SELECT,
    rejectedBy: REQUESTER_SELECT,
  };
}

export interface CreateDraftPRRequestData {
  requestedByUserId: string;
  projectData: Prisma.InputJsonValue;
}

/** Draft creation — status defaults to "Draft" (schema.prisma), assignedPmoManagerId stays null until sendToAccounts(). */
export function createDraftPRRequest(data: CreateDraftPRRequestData) {
  return prisma.pRRequest.create({ data, include: withDisplayRelations() });
}

/** Overwrites projectData in place — authorization (Draft owner, or the current stage's assigned approver) is fully enforced in the service layer before this runs. */
export function updateProjectData(id: string, projectData: Prisma.InputJsonValue) {
  return prisma.pRRequest.update({ where: { id }, data: { projectData }, include: withDisplayRelations() });
}

export function deletePRRequest(id: string) {
  return prisma.pRRequest.delete({ where: { id } });
}

/**
 * Send to Accounts — the Draft-specific variant of claimStatusTransition()
 * below, extended to also set assignedAccountsApproverId/assignedPmoManagerId
 * atomically with the status flip (the requester picks both as part of this
 * same action, never inside the form itself — see schema.prisma's
 * PRRequest.assignedAccountsApproverId/assignedPmoManagerId comments). Same
 * conditional-UPDATE concurrency guarantee: a double-click can only ever win
 * this claim once.
 */
export function claimDraftForSendToAccounts(id: string, assignedAccountsApproverId: string, assignedPmoManagerId: string) {
  return prisma.pRRequest.updateMany({
    where: { id, status: "Draft" },
    data: { status: "Pending Accounts Approval", assignedAccountsApproverId, assignedPmoManagerId },
  });
}

export function findPRRequestById(id: string) {
  return prisma.pRRequest.findUnique({ where: { id }, include: withDisplayRelations() });
}

export function findPRRequestsByRequester(requestedByUserId: string) {
  return prisma.pRRequest.findMany({
    where: { requestedByUserId },
    include: withDisplayRelations(),
    orderBy: { createdAt: "desc" },
  });
}

export function findPRRequests(where: Prisma.PRRequestWhereInput) {
  return prisma.pRRequest.findMany({ where, include: withDisplayRelations(), orderBy: { createdAt: "desc" } });
}

export function findApprovalHistory(prRequestId: string) {
  return prisma.pRRequestApprovalHistory.findMany({
    where: { prRequestId },
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function createApprovalHistoryEntry(data: {
  prRequestId: string;
  actorUserId: string;
  action: string;
  remarks?: string | null;
}) {
  return prisma.pRRequestApprovalHistory.create({ data });
}

/**
 * The single atomic "claim ticket" every stage transition (Accounts approve,
 * PMO Manager approve, reject at either stage) goes through — a plain SQL
 * UPDATE ... WHERE id = ? AND status = ? is one indivisible Postgres
 * statement, so of two concurrent calls racing to transition the SAME
 * request (e.g. a network retry resubmitting the same click), only the one
 * whose WHERE clause still matches at execution time updates a row
 * (count === 1); the loser's WHERE no longer matches the now-changed status
 * and updates zero rows (count === 0) — a clean, structural "already
 * actioned" signal the service layer turns into a 409, before anything else
 * (notably: before Project creation) ever runs. See prRequest.service.ts's
 * approvePmoManagerStage() for why this — rather than the advisory-lock
 * pattern used elsewhere in this codebase (reminder/invoice/milestone
 * services) — is the correct mechanism here: those all do every read/write
 * for the locked operation through one transaction's `tx` client, but this
 * operation's second half calls the EXISTING, unmodified
 * projects/services/project.service.ts createProject() function, which
 * always uses the plain `prisma` client internally and cannot be handed a
 * `tx`. A conditional UPDATE's atomicity does not depend on being inside a
 * shared transaction, so it composes safely with a subsequent, separate call
 * into code this module doesn't own.
 */
export function claimStatusTransition(id: string, fromStatus: string, toStatus: string) {
  return prisma.pRRequest.updateMany({ where: { id, status: fromStatus }, data: { status: toStatus } });
}

/** Used only to roll a claimed-but-not-yet-finalized transition back if the step after the claim (Project creation) fails — see approvePmoManagerStage(). */
export function revertStatus(id: string, toStatus: string) {
  return prisma.pRRequest.update({ where: { id }, data: { status: toStatus } });
}

export function attachCreatedProject(id: string, createdProjectId: string) {
  return prisma.pRRequest.update({ where: { id }, data: { createdProjectId } });
}

export function recordRejection(id: string, rejectedByUserId: string, rejectionReason: string) {
  return prisma.pRRequest.update({
    where: { id },
    data: { rejectedByUserId, rejectionReason, rejectedAt: new Date() },
  });
}

/** Role-aware user lookup for the PMO Manager eligibility check in prRequest.service.ts (is this user active + does it hold the expected role) — kept here rather than in users/repository/user.repository.ts since it exists only for this workflow's own validation, not the User Directory. */
export function findPortalUserWithRole(id: string) {
  return prisma.portalUser.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, isActive: true, role: { select: { name: true } } },
  });
}

/** Plain active-user lookup for the Accounts Approver eligibility check — deliberately role-agnostic (confirmed business decision: any active user may be picked, not just users holding the "Accounts" role — see sendToAccountsSchema's own comment). */
export function findActiveUserById(id: string) {
  return prisma.portalUser.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, isActive: true },
  });
}
