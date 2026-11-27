import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { PR_APPROVAL_ADMINISTRATION, assertAdminRight } from "../../../shared/utils/adminRights.js";
import { createAuditLog } from "../../auth/repository/auth.repository.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import type { PRRequestDetailDto, PRRequestDto } from "../dto/prRequest.dto.js";
import * as repo from "../repository/prRequest.repository.js";
import type { AdminEditPRRequestInput, AdminListPRRequestsQuery, AdminReassignInput } from "../validators/prRequestAdmin.validators.js";
import {
  assertDraftCoordinatorAssignable,
  assertDraftTaxFields,
  notifyCurrentStageApprover,
  performAccountsApproval,
  performPmoManagerApproval,
  performRejection,
  regionalCurrencyOfRequest,
  toApprovalHistoryDto,
  toPRRequestDto,
  type PRRequestRow,
} from "./prRequest.service.js";

/**
 * Administrative Controls - PR Approval Administration (Nov 2026).
 *
 * Every function first re-checks, from the database, that the caller is an ACTIVE Administrator holding "PR Approval Administration"
 * (assertAdminRight); the normal approver workflow in prRequest.service.ts is unchanged for everyone else.
 *
 * Rules:
 *  - An administrator acts at the request's CURRENT stage only - approving a "Pending Accounts Approval" request moves it to the PMO stage, never
 *    straight to Approved. The stage work itself (claims, validation, exactly-once project creation, notifications) is the SAME code the assigned
 *    approver runs (performAccountsApproval / performPmoManagerApproval / performRejection).
 *  - Every action needs a reason and is written to the approval history with the acting administrator as actor and the assigned approver as
 *    "on behalf of".
 *  - Final approval: the project is owned by the assigned PMO Manager (unchanged); the country check uses the administrator's own country access (D2).
 *  - Delete is a soft delete (status "Deleted", who/when/why kept), allowed for Draft, pending and Rejected requests - never Approved ones.
 */

type PendingStatus = "Pending Accounts Approval" | "Pending PMO Manager Approval";
const PENDING: readonly string[] = ["Pending Accounts Approval", "Pending PMO Manager Approval"];
const EDITABLE: readonly string[] = ["Draft", ...PENDING];
const DELETABLE: readonly string[] = ["Draft", ...PENDING, "Rejected"];

export interface AdminPRRequestDto extends PRRequestDto {
  /** PR Category (= the project's country) from the request data; "" when not filled in yet. */
  prCategory: string;
  prNo: string;
  projectName: string;
  customerName: string;
}

async function loadOr404(id: string): Promise<PRRequestRow> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) throw new AppError("PR Request not found.", 404);
  return existing;
}

function dataField(row: PRRequestRow, key: string): string {
  const data = row.projectData;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function toAdminDto(row: PRRequestRow): AdminPRRequestDto {
  return {
    ...toPRRequestDto(row),
    prCategory: dataField(row, "prCategory"),
    prNo: dataField(row, "prNo"),
    projectName: dataField(row, "projectTitle"),
    customerName: dataField(row, "client"),
  };
}

/** Whoever must act at the request's current stage (the requester for a Draft). */
function currentStageOwner(row: PRRequestRow): string | null {
  if (row.status === "Pending Accounts Approval") return row.assignedAccountsApproverId;
  if (row.status === "Pending PMO Manager Approval") return row.assignedPmoManagerId;
  if (row.status === "Draft") return row.requestedByUserId;
  return null;
}

async function audit(actor: AccessTokenPayload, event: string, row: PRRequestRow, details: Record<string, unknown>): Promise<void> {
  try {
    await createAuditLog({
      userId: actor.sub,
      email: actor.email,
      event,
      details: { prRequestId: row.id, prNo: dataField(row, "prNo"), statusBefore: row.status, ...details } as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.error("[prRequestAdmin] audit log failed:", error instanceof Error ? error.message : error);
  }
}

/** The cross-country register: every status (Deleted included), every country. Filters are optional. */
export async function listAllForAdmin(actor: AccessTokenPayload, query: AdminListPRRequestsQuery): Promise<AdminPRRequestDto[]> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const where: Prisma.PRRequestWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
  if (query.approverId) where.OR = [{ assignedAccountsApproverId: query.approverId }, { assignedPmoManagerId: query.approverId }];
  if (query.prCategory) where.projectData = { path: ["prCategory"], equals: query.prCategory };
  const rows = await repo.findPRRequestsForAdmin(where);
  return rows.map(toAdminDto);
}

/** Any request's detail with its full history (Deleted included) - holders only; no module grant needed. */
export async function getDetailForAdmin(id: string, actor: AccessTokenPayload): Promise<AdminPRRequestDto & Pick<PRRequestDetailDto, "approvalHistory" | "regionalCurrency">> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  const history = await repo.findApprovalHistory(id);
  return { ...toAdminDto(existing), approvalHistory: history.map(toApprovalHistoryDto), regionalCurrency: await regionalCurrencyOfRequest(existing) };
}

/** Edit the data of a Draft or pending request (same validation as the form). Logged as AdminEdited only when something actually changed. */
export async function adminEdit(id: string, actor: AccessTokenPayload, input: AdminEditPRRequestInput): Promise<PRRequestDto> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  if (!EDITABLE.includes(existing.status)) {
    throw new AppError(`A request that is ${existing.status} can no longer be edited.`, 409);
  }
  await assertDraftCoordinatorAssignable(input.projectData, existing.projectData);
  await assertDraftTaxFields(input.projectData);

  const normalized = JSON.parse(JSON.stringify(input.projectData)) as unknown;
  const changed = !isDeepStrictEqual(existing.projectData, normalized);
  if (changed) {
    const result = await repo.updateProjectDataIfStatus(id, existing.status, input.projectData as unknown as Prisma.InputJsonValue);
    if (result.count === 0) throw new AppError("This request was actioned by someone else meanwhile - reload and try again.", 409);
    await repo.createApprovalHistoryEntry({
      prRequestId: id,
      actorUserId: actor.sub,
      action: "AdminEdited",
      remarks: input.reason,
      onBehalfOfUserId: currentStageOwner(existing),
    });
    await audit(actor, "PR_REQUEST_ADMIN_EDITED", existing, { reason: input.reason });
  }
  return toPRRequestDto(await loadOr404(id));
}

/** Approve at the CURRENT stage only (Accounts -> PMO stage; PMO stage -> Approved + project). */
export async function adminApprove(id: string, actor: AccessTokenPayload, reason: string): Promise<PRRequestDto> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  if (existing.status === "Pending Accounts Approval") {
    const result = await performAccountsApproval(existing, actor, {
      action: "AdminAccountsApproved",
      remarks: reason,
      onBehalfOfUserId: existing.assignedAccountsApproverId,
    });
    await audit(actor, "PR_REQUEST_ADMIN_APPROVED", existing, { stage: "Accounts", reason });
    return result;
  }
  if (existing.status === "Pending PMO Manager Approval") {
    // D2: the administrator's own country access authorises the project's country; the owner stays the assigned PMO Manager.
    const result = await performPmoManagerApproval(
      existing,
      actor,
      { action: "AdminPmoManagerApproved", remarks: reason, onBehalfOfUserId: existing.assignedPmoManagerId },
      actor.sub
    );
    await audit(actor, "PR_REQUEST_ADMIN_APPROVED", existing, { stage: "PMO Manager", reason, createdProjectId: result.createdProjectId });
    return result;
  }
  throw new AppError(`Only a pending request can be approved (this one is ${existing.status}).`, 409);
}

export async function adminReject(id: string, actor: AccessTokenPayload, reason: string): Promise<PRRequestDto> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  if (!PENDING.includes(existing.status)) {
    throw new AppError(`Only a pending request can be rejected (this one is ${existing.status}).`, 409);
  }
  const result = await performRejection(existing, actor, existing.status as PendingStatus, {
    action: "AdminRejected",
    remarks: reason,
    onBehalfOfUserId: currentStageOwner(existing),
  });
  await audit(actor, "PR_REQUEST_ADMIN_REJECTED", existing, { reason });
  return result;
}

/**
 * Change the approver(s) of a pending request (D5 - fixes requests stranded on an absent or wrong approver). The Accounts approver can be changed
 * only while the request is still at the Accounts stage; the PMO Manager at either pending stage (same eligibility rules as Send to Accounts).
 * The newly assigned approver of the CURRENT stage is notified the same way a normal hand-over notifies.
 */
export async function adminReassign(id: string, actor: AccessTokenPayload, input: AdminReassignInput): Promise<PRRequestDto> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  if (!PENDING.includes(existing.status)) {
    throw new AppError(`Only a pending request can be reassigned (this one is ${existing.status}).`, 409);
  }
  const data: { assignedAccountsApproverId?: string; assignedPmoManagerId?: string } = {};
  const changes: string[] = [];

  if (input.assignedAccountsApproverId && input.assignedAccountsApproverId !== existing.assignedAccountsApproverId) {
    if (existing.status !== "Pending Accounts Approval") {
      throw new AppError("The Accounts stage is already complete - its approver can no longer be changed.", 409);
    }
    const user = await repo.findActiveUserById(input.assignedAccountsApproverId);
    if (!user || !user.isActive) throw new AppError("The selected Accounts Approver is not a valid, active user.", 400);
    data.assignedAccountsApproverId = user.id;
    changes.push(`Accounts Approver: ${existing.assignedAccountsApprover?.fullName ?? "none"} -> ${user.fullName}`);
  }
  if (input.assignedPmoManagerId && input.assignedPmoManagerId !== existing.assignedPmoManagerId) {
    const user = await repo.findPortalUserWithRole(input.assignedPmoManagerId);
    if (!user || !user.isActive || user.role.name !== "PMO Manager") {
      throw new AppError("The selected PMO Manager is not a valid, active PMO Manager.", 400);
    }
    data.assignedPmoManagerId = user.id;
    changes.push(`PMO Manager: ${existing.assignedPmoManager?.fullName ?? "none"} -> ${user.fullName}`);
  }
  if (changes.length === 0) throw new AppError("Choose a different approver to reassign.", 400);

  const result = await repo.reassignApprovers(id, existing.status, data);
  if (result.count === 0) throw new AppError("This request was actioned by someone else meanwhile - reload and try again.", 409);
  await repo.createApprovalHistoryEntry({
    prRequestId: id,
    actorUserId: actor.sub,
    action: "Reassigned",
    remarks: `${input.reason} (${changes.join("; ")})`,
    onBehalfOfUserId: currentStageOwner(existing),
  });
  await audit(actor, "PR_REQUEST_ADMIN_REASSIGNED", existing, { reason: input.reason, changes });

  const updated = await loadOr404(id);
  if (currentStageOwner(updated) !== currentStageOwner(existing)) {
    void notifyCurrentStageApprover(updated).catch((error) => {
      console.error("[prRequestAdmin] notifyCurrentStageApprover failed:", error instanceof Error ? error.message : error);
    });
  }
  return toPRRequestDto(updated);
}

/** Soft delete (status "Deleted"; request + history kept, hidden from ordinary lists). Never for an Approved request - a project exists. */
export async function adminDelete(id: string, actor: AccessTokenPayload, reason: string): Promise<PRRequestDto> {
  await assertAdminRight(actor, PR_APPROVAL_ADMINISTRATION);
  const existing = await loadOr404(id);
  if (existing.status === "Approved") {
    throw new AppError("An approved request cannot be deleted - its project already exists.", 409);
  }
  if (!DELETABLE.includes(existing.status)) {
    throw new AppError(`A request that is ${existing.status} cannot be deleted.`, 409);
  }
  const result = await repo.claimAdminDelete(id, existing.status, actor.sub, reason);
  if (result.count === 0) throw new AppError("This request was actioned by someone else meanwhile - reload and try again.", 409);
  await repo.createApprovalHistoryEntry({
    prRequestId: id,
    actorUserId: actor.sub,
    action: "AdminDeleted",
    remarks: reason,
    onBehalfOfUserId: null,
  });
  await audit(actor, "PR_REQUEST_ADMIN_DELETED", existing, { reason });
  return toPRRequestDto(await loadOr404(id));
}
