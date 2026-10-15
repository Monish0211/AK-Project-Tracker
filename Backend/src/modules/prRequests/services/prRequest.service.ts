import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { env } from "../../../shared/utils/env.js";
import { sendEmail } from "../../../shared/email/email.service.js";
import { buildPRRequestAccountsApprovedEmail } from "../../../shared/email/templates/prRequestAccountsApproved.template.js";
import { buildPRRequestApprovedEmail } from "../../../shared/email/templates/prRequestApproved.template.js";
import { buildPRRequestRejectedEmail } from "../../../shared/email/templates/prRequestRejected.template.js";
import { buildPRRequestSubmittedEmail } from "../../../shared/email/templates/prRequestSubmitted.template.js";
import { notify } from "../../notifications/notification.service.js";
import { createProject } from "../../projects/services/project.service.js";
import { createQuantityForProject } from "../../quantity/services/quantity.service.js";
import { createMilestoneForProject } from "../../milestones/services/milestone.service.js";
import { repointDocumentsToProject } from "../../documents/repository/document.repository.js";
import { assertCoordinatorEntryAssignable } from "../../pmoCoordinators/index.js";
import { prRequestProjectDataSchema } from "../validators/prRequest.validators.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import type { PRRequestApprovalHistoryDto, PRRequestDetailDto, PRRequestDto } from "../dto/prRequest.dto.js";
import * as repo from "../repository/prRequest.repository.js";
import type { PRRequestProjectDataInput, SaveDraftPRRequestInput, SendToAccountsInput } from "../validators/prRequest.validators.js";

type PRRequestRow = NonNullable<Awaited<ReturnType<typeof repo.findPRRequestById>>>;

function toPRRequestDto(row: PRRequestRow): PRRequestDto {
  return {
    id: row.id,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedBy.fullName,
    assignedAccountsApproverId: row.assignedAccountsApproverId,
    assignedAccountsApproverName: row.assignedAccountsApprover?.fullName ?? null,
    assignedPmoManagerId: row.assignedPmoManagerId,
    assignedPmoManagerName: row.assignedPmoManager?.fullName ?? null,
    projectData: row.projectData as unknown as PRRequestProjectDataInput,
    status: row.status as PRRequestDto["status"],
    createdProjectId: row.createdProjectId,
    rejectedByUserId: row.rejectedByUserId,
    rejectedByName: row.rejectedBy?.fullName ?? null,
    rejectionReason: row.rejectionReason,
    rejectedAt: row.rejectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toApprovalHistoryDto(row: Awaited<ReturnType<typeof repo.findApprovalHistory>>[number]): PRRequestApprovalHistoryDto {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorName: row.actor.fullName,
    action: row.action as PRRequestApprovalHistoryDto["action"],
    remarks: row.remarks,
    createdAt: row.createdAt,
  };
}

/**
 * Save a new Draft. Mirrors Add Project's own real behavior exactly (see
 * ProjectForm.tsx/FormButtons.tsx): the requester fills in General/Quantity/
 * Payments/Expense Budget — the SAME four sections, same field set, same
 * validation — and this just persists that data. No Project is created, no
 * approver is notified, and no approval-history row exists yet: a Draft is
 * private to the requester until sendToAccounts() below. There is
 * deliberately no Assigned PMO Manager field here at all — see
 * schema.prisma's PRRequest.assignedPmoManagerId comment.
 */
/**
 * PMO Coordinator (Oct 2026): a newly chosen registry entry must be assignable
 * when it is saved. An unchanged entry is not re-checked here (approval does
 * that), so a reviewer can still correct other fields if the coordinator's
 * account changed meanwhile.
 */
async function assertDraftCoordinatorAssignable(next: { pmoCoordinatorEntryId?: string | undefined }, previous: unknown): Promise<void> {
  const nextId = next.pmoCoordinatorEntryId;
  if (!nextId) return;
  const previousId =
    previous && typeof previous === "object" ? (previous as { pmoCoordinatorEntryId?: unknown }).pmoCoordinatorEntryId : undefined;
  if (nextId === previousId) return;
  await assertCoordinatorEntryAssignable(nextId);
}

export async function saveDraftPRRequest(input: SaveDraftPRRequestInput, requester: AccessTokenPayload): Promise<PRRequestDto> {
  await assertDraftCoordinatorAssignable(input.projectData, undefined);
  const created = await repo.createDraftPRRequest({
    requestedByUserId: requester.sub,
    projectData: input.projectData as unknown as Prisma.InputJsonValue,
  });

  return toPRRequestDto(created);
}

/**
 * Edits a PR Request's project data in place. Two distinct callers, same
 * function: (1) the requester, only while status is still "Draft" — the
 * original pre-submission editing case; (2) whoever is currently the
 * assigned approver for the request's CURRENT pending stage — Accounts may
 * correct data while it's "Pending Accounts Approval", the PMO Manager
 * while it's "Pending PMO Manager Approval" — so a reviewer can fix a
 * mistake (wrong PR Number, budget figure, etc.) before approving, without
 * having to reject and ask the requester to resubmit from scratch. Once
 * Approved or Rejected, the record is frozen for everyone — no edit-after-
 * finalization in this phase. An edit by an approver (not the original
 * Draft-stage edit) is logged to the approval history for traceability,
 * since at that point this is reviewed, not just self-reported, data.
 */
export async function updatePRRequestProjectData(
  id: string,
  input: SaveDraftPRRequestInput,
  actor: AccessTokenPayload
): Promise<PRRequestDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }

  let isApproverEdit: boolean;
  if (existing.status === "Draft") {
    if (existing.requestedByUserId !== actor.sub) {
      throw new AppError("You do not have access to this PR Request.", 403);
    }
    isApproverEdit = false;
  } else if (existing.status === "Pending Accounts Approval") {
    if (!existing.assignedAccountsApproverId || existing.assignedAccountsApproverId !== actor.sub) {
      throw new AppError("You are not authorized to edit this request at its current stage.", 403);
    }
    isApproverEdit = true;
  } else if (existing.status === "Pending PMO Manager Approval") {
    if (!existing.assignedPmoManagerId || existing.assignedPmoManagerId !== actor.sub) {
      throw new AppError("You are not authorized to edit this request at its current stage.", 403);
    }
    isApproverEdit = true;
  } else {
    throw new AppError("This request has already been finalized and can no longer be edited.", 409);
  }

  // The frontend's Approve/Reject actions always PATCH the current form
  // state first, unconditionally, so a reviewer's edit is never silently
  // lost just because they approved without clicking a separate Save first
  // (see PRRequestReviewFormButtons.tsx). That means most approvals will
  // call this function with data that's actually IDENTICAL to what's
  // already stored — only log "Edited" when something genuinely changed, so
  // the audit trail isn't polluted with a spurious entry on every ordinary
  // approval that made no correction at all.
  //
  // Deliberately NOT a JSON.stringify(...) === JSON.stringify(...) check —
  // that looked right in isolation but is unreliable here for two real
  // reasons: (1) Postgres JSONB does not preserve object key order, so
  // `existing.projectData` read back from the database can have its keys in
  // a different order than the freshly-built `input.projectData`, even when
  // every value is identical, and JSON.stringify is order-sensitive; (2)
  // `input.projectData` has already been through Zod's `z.coerce.date()`
  // (real Date objects), while `existing.projectData` is a JSON value where
  // every date already collapsed to a plain ISO string — two representions
  // of the same instant that JSON.stringify treats as different. Round-
  // tripping the input through JSON first collapses its Dates to the same
  // string form the database already uses, and isDeepStrictEqual compares
  // structurally (key order never matters), so this is the one comparison
  // that's actually correct for "did the caller's data change vs. what's
  // stored," not just "do these two serializations happen to match."
  await assertDraftCoordinatorAssignable(input.projectData, existing.projectData);

  const normalizedInput = JSON.parse(JSON.stringify(input.projectData)) as unknown;
  const dataActuallyChanged = !isDeepStrictEqual(existing.projectData, normalizedInput);

  const updated = await repo.updateProjectData(id, input.projectData as unknown as Prisma.InputJsonValue);

  if (isApproverEdit && dataActuallyChanged) {
    await repo.createApprovalHistoryEntry({ prRequestId: id, actorUserId: actor.sub, action: "Edited" });
  }

  return toPRRequestDto(updated);
}

/** Discards a Draft — only the requester who owns it, and only while it's still a Draft. Hard delete: nothing else can reference a Draft yet (no approval history, no notifications sent), so there's nothing to preserve. */
export async function deleteDraftPRRequest(id: string, requester: AccessTokenPayload): Promise<void> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }
  if (existing.requestedByUserId !== requester.sub) {
    throw new AppError("You do not have access to this PR Request.", 403);
  }
  if (existing.status !== "Draft") {
    throw new AppError("Only a Draft PR Request can be deleted.", 409);
  }

  await repo.deletePRRequest(id);
}

/**
 * Send to Accounts — the real submission action, separate from the form
 * itself. This is where the requester picks BOTH the Assigned Accounts
 * Approver and the Assigned PMO Manager, and where the approval chain
 * actually starts (Accounts is notified for the first time here). Only the
 * requester who owns the Draft may do this. The Accounts approver is
 * deliberately NOT restricted to a particular role — any active user may be
 * picked (confirmed business decision) — while the PMO Manager stays
 * role-restricted, matching the original design.
 */
export async function sendToAccounts(id: string, input: SendToAccountsInput, requester: AccessTokenPayload): Promise<PRRequestDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }
  if (existing.requestedByUserId !== requester.sub) {
    throw new AppError("You do not have access to this PR Request.", 403);
  }
  if (existing.status !== "Draft") {
    throw new AppError("This request has already been sent for approval.", 409);
  }

  const accountsApprover = await repo.findActiveUserById(input.assignedAccountsApproverId);
  if (!accountsApprover || !accountsApprover.isActive) {
    throw new AppError("The selected Accounts Approver is not a valid, active user.", 400);
  }

  const pmoManager = await repo.findPortalUserWithRole(input.assignedPmoManagerId);
  if (!pmoManager || !pmoManager.isActive || pmoManager.role.name !== "PMO Manager") {
    throw new AppError("The selected PMO Manager is not a valid, active PMO Manager.", 400);
  }

  // Same claim-ticket concurrency guarantee as every other stage transition
  // in this module — a double-click on "Send to Accounts" can only ever win
  // this claim once.
  const claimed = await repo.claimDraftForSendToAccounts(id, input.assignedAccountsApproverId, input.assignedPmoManagerId);
  if (claimed.count === 0) {
    throw new AppError("This request has already been sent for approval.", 409);
  }

  await repo.createApprovalHistoryEntry({ prRequestId: id, actorUserId: requester.sub, action: "Submitted" });

  const updated = await repo.findPRRequestById(id);
  if (!updated) {
    throw new AppError("PR Request not found.", 404);
  }

  // Fire-and-forget: the state transition above is already committed and the
  // response DTO is built from `updated`, which was read before this line, so
  // nothing below depends on delivery. Awaiting it put an SMTP round-trip
  // (and, when VAPID is configured, web-push network calls) directly in the
  // HTTP response path.
  //
  // .catch() rather than a bare `void`: notify() and sendEmail() each swallow
  // their own failures, but the payload built inside the notifier dereferences
  // request.projectData / request.requestedBy OUTSIDE any try/catch, so a
  // malformed row could still reject synchronously. This guarantees that can
  // never become an unhandled rejection.
  void notifyAccountsApprover(updated).catch((error) => {
    console.error("[prRequests] notifyAccountsApprover failed:", error instanceof Error ? error.message : error);
  });

  return toPRRequestDto(updated);
}

/** Requester Data Privacy — a PR Request User sees only requests they themselves submitted, never anyone else's. */
export async function listMyPRRequests(requester: AccessTokenPayload): Promise<PRRequestDto[]> {
  const rows = await repo.findPRRequestsByRequester(requester.sub);
  return rows.map(toPRRequestDto);
}

/**
 * "My Approvals" queue — every request the caller can currently act on,
 * plus (Administrator only) every in-flight request, for oversight. Never
 * broader than that for anyone else: a PMO Manager (or Accounts approver)
 * sees only requests assigned to THEM specifically on that request, chosen
 * per-request by the requester at Send to Accounts time — never a role-wide
 * or globally-configured queue.
 */
export async function listApprovalsQueueForCaller(caller: AccessTokenPayload): Promise<PRRequestDto[]> {
  const isAdministrator = caller.roleName === "Administrator";

  const orConditions: Prisma.PRRequestWhereInput[] = [
    { status: "Pending Accounts Approval", assignedAccountsApproverId: caller.sub },
    { status: "Pending PMO Manager Approval", assignedPmoManagerId: caller.sub },
  ];
  if (isAdministrator) {
    orConditions.push({ status: { in: ["Pending Accounts Approval", "Pending PMO Manager Approval"] } });
  }

  const rows = await repo.findPRRequests({ OR: orConditions });
  return rows.map(toPRRequestDto);
}

// Exported for the Documents module (documents.service.ts) to reuse
// verbatim for PR-Request-attached document authorization — never a second,
// independently-drifting PR Request visibility check.
export function assertCanViewPRRequest(request: PRRequestRow, caller: AccessTokenPayload): void {
  if (caller.roleName === "Administrator") return;
  if (request.requestedByUserId === caller.sub) return;
  if (request.assignedAccountsApproverId === caller.sub) return;
  if (request.assignedPmoManagerId === caller.sub) return;

  throw new AppError("You do not have access to this PR Request.", 403);
}

export async function getPRRequestDetail(id: string, caller: AccessTokenPayload): Promise<PRRequestDetailDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }
  assertCanViewPRRequest(existing, caller);

  const history = await repo.findApprovalHistory(id);
  return { ...toPRRequestDto(existing), approvalHistory: history.map(toApprovalHistoryDto) };
}

/**
 * Stage 1 — Accounts approval. Moves the request to "Pending PMO Manager
 * Approval"; never touches Project data. Authorization is an identity check
 * against THIS request's own assignedAccountsApproverId (set once, at Send
 * to Accounts time, by the requester) — not a role-name check, and not a
 * global setting: only the specific person chosen for this request may act.
 */
export async function accountsApprove(id: string, actor: AccessTokenPayload, remarks?: string | null): Promise<PRRequestDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }

  if (!existing.assignedAccountsApproverId || existing.assignedAccountsApproverId !== actor.sub) {
    throw new AppError("You are not the assigned Accounts Approver for this PR Request.", 403);
  }

  // See prRequest.repository.ts's claimStatusTransition() for why this
  // conditional UPDATE — not the existence check above — is the real
  // concurrency guarantee: two racing approve calls can both pass the
  // findPRRequestById() read, but only one can win this claim.
  const claimed = await repo.claimStatusTransition(id, "Pending Accounts Approval", "Pending PMO Manager Approval");
  if (claimed.count === 0) {
    throw new AppError("This request is not pending Accounts approval — it may have already been actioned.", 409);
  }

  await repo.createApprovalHistoryEntry({
    prRequestId: id,
    actorUserId: actor.sub,
    action: "AccountsApproved",
    remarks: remarks ?? null,
  });

  const updated = await repo.findPRRequestById(id);
  if (!updated) {
    throw new AppError("PR Request not found.", 404);
  }

  // Fire-and-forget — see notifyAccountsApprover's call site above for the
  // full reasoning (committed state, response built from `updated`, and why
  // .catch() is used instead of a bare `void`).
  void notifyAssignedPmoManager(updated).catch((error) => {
    console.error("[prRequests] notifyAssignedPmoManager failed:", error instanceof Error ? error.message : error);
  });

  return toPRRequestDto(updated);
}

/**
 * Stage 2 — PMO Manager approval. The ONLY code path that ever creates a
 * real Project from a PRRequest. Exactly-once is guaranteed by the
 * claimStatusTransition() conditional UPDATE below — a retried/duplicate
 * approve call always finds the row no longer in "Pending PMO Manager
 * Approval" once the first call has claimed it, and is rejected with a
 * clean 409 before createProject() is ever called a second time. See
 * prRequest.repository.ts's claimStatusTransition() doc comment for why
 * this pattern (not the advisory-lock pattern used elsewhere in this
 * codebase) is the correct mechanism for an operation whose second half
 * calls into another module's existing, un-transaction-aware service
 * function.
 */
export async function pmoManagerApprove(id: string, actor: AccessTokenPayload, remarks?: string | null): Promise<PRRequestDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }
  if (!existing.assignedPmoManagerId || existing.assignedPmoManagerId !== actor.sub) {
    throw new AppError("You are not the assigned PMO Manager for this PR Request.", 403);
  }

  // Same 409 the claim below gives, checked early so an already-finalized
  // request never reaches the data validation that follows.
  if (existing.status !== "Pending PMO Manager Approval") {
    throw new AppError("This request was already approved or rejected by another action.", 409);
  }

  // Re-validated against the exact same schema the Draft form itself uses,
  // BEFORE the status is claimed. Data saved before a field became required
  // (e.g. RFQ No., Oct 2026) can fail here; checking first means such a
  // request stays "Pending PMO Manager Approval" — correctable by the PMO
  // Manager in the review form — instead of being left "Approved" with no
  // Project. quantityItems/paymentMilestones are split out below —
  // createProject() only ever accepts the flat General/Expense Budget fields
  // (its own createProjectSchema), never these two arrays.
  const parsed = prRequestProjectDataSchema.safeParse(existing.projectData);
  if (!parsed.success) {
    throw new AppError(
      `This PR Request cannot be approved until it is complete: ${parsed.error.issues[0]?.message ?? "invalid project data."}`,
      400
    );
  }
  const { quantityItems, paymentMilestones, ...generalInfo } = parsed.data;

  const claimed = await repo.claimStatusTransition(id, "Pending PMO Manager Approval", "Approved");
  if (claimed.count === 0) {
    throw new AppError("This request was already approved or rejected by another action.", 409);
  }

  let createdProject: Awaited<ReturnType<typeof createProject>>;
  try {
    // The EXISTING, unmodified project.service.ts createProject() — never
    // duplicated or re-implemented here. The approving PMO Manager becomes
    // the created Project's owner (createdByUserId), not the original PR
    // Request User: PMO Manager already has unrestricted Project visibility
    // (see projectAccess.ts's hasUnrestrictedProjectVisibility), so this
    // choice never affects who CAN see the project — it only decides who is
    // recorded as managing it going forward, which is the PMO Manager who
    // just approved it, not a "PR Request User" role that typically holds no
    // ongoing Projects module access at all.
    createdProject = await createProject(generalInfo, existing.assignedPmoManagerId);
  } catch (err) {
    // Creation failed (e.g. a PR Number collision that appeared between
    // submission and approval) — revert the claim so the request isn't left
    // permanently stuck "Approved" with no linked Project; it can be
    // retried or rejected instead.
    await repo.revertStatus(id, "Pending PMO Manager Approval");
    throw err;
  }

  // Link the PR Request to the Project it just produced, IMMEDIATELY after
  // createProject() returns and before anything else.
  //
  // This is NOT atomic with the status -> "Approved" claim above: they are
  // two separate auto-committed statements (claimStatusTransition() writes
  // only `status`, this writes only `createdProjectId`), and this module
  // deliberately uses no Prisma transaction — createProject() cannot accept
  // an outer `tx`, which is exactly why the claim-ticket pattern is used
  // instead. So a crash between the two still leaves an "Approved" request
  // with a null createdProjectId; running this here simply shrinks that
  // window to one statement rather than spanning the document repoint and
  // the entire Quantity/Milestone replay below, which together take
  // meaningfully longer.
  //
  // Nothing further down depends on this having run: the repoint and both
  // replay loops all receive createdProject.id as a direct argument and
  // never read PRRequest.createdProjectId back.
  await repo.attachCreatedProject(id, createdProject.id);

  // Documents feature — re-point (never copy) any documents uploaded while
  // this was still a PR Request onto the now-real Project. The Project is
  // already irrevocably committed at this point (same reasoning as the
  // Quantity/Milestone replay below) — a failure here is logged, not
  // reverted, so a retry can never risk creating the Project a second time.
  // The underlying update is a single, naturally idempotent statement (see
  // repointDocumentsToProject()'s own comment) on top of the claimStatusTransition
  // guard above, which already prevents this code from running twice for
  // one approval.
  try {
    await repointDocumentsToProject(id, createdProject.id);
  } catch (err) {
    console.error(`[prRequests] Failed to re-point documents for PR Request ${id} -> Project ${createdProject.id}:`, err);
  }

  // Replay the Draft's captured Quantity/Payments data onto the now-real
  // Project — these child rows could never be created earlier (both require
  // a real projectId FK, which didn't exist until createProject() just
  // above succeeded). Uses the EXISTING, unmodified quantity/milestone
  // service functions, one call per row (neither module exposes a bulk/
  // transactional multi-row create outside its Administrator-only Ingest
  // path — see quantity/milestone modules' own comments). The PRRequest is
  // already durably "Approved" with a real createdProjectId at this point
  // (see attachCreatedProject() above) — a failure here is deliberately
  // NOT reverted (unlike the createProject() failure above): the Project is
  // real and must never risk being created a second time by a retry, so any
  // partial Quantity/Milestone failure is logged and surfaced via the
  // approval-history remarks instead, for manual follow-up in Edit Project.
  const replayFailures: string[] = [];
  for (const item of quantityItems) {
    try {
      await createQuantityForProject(createdProject.id, item, actor);
    } catch (err) {
      replayFailures.push(`Quantity item "${item.description}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  for (const milestone of paymentMilestones) {
    try {
      await createMilestoneForProject(createdProject.id, milestone, actor);
    } catch (err) {
      replayFailures.push(`Payment milestone "${milestone.milestoneName}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  if (replayFailures.length > 0) {
    console.error(`[prRequests] Partial replay failure for PR Request ${id} -> Project ${createdProject.id}:`, replayFailures);
  }

  // attachCreatedProject() used to run here, after the repoint and replay.
  // It now runs immediately after createProject() instead — see that call
  // site for why.
  const replayNote =
    replayFailures.length > 0
      ? `Project created, but ${replayFailures.length} Quantity/Payment item(s) failed to import — please add them manually via Edit Project: ${replayFailures.join("; ")}`
      : null;
  await repo.createApprovalHistoryEntry({
    prRequestId: id,
    actorUserId: actor.sub,
    action: "PmoManagerApproved",
    remarks: replayNote ?? (remarks ?? null),
  });

  const updated = await repo.findPRRequestById(id);
  if (!updated) {
    throw new AppError("PR Request not found.", 404);
  }

  // Fire-and-forget — see notifyAccountsApprover's call site for the full
  // reasoning. Project creation, the document repoint and the Quantity/
  // Milestone replay have all completed and been recorded before this point;
  // notification delivery is the only thing left and nothing depends on it.
  void notifyRequesterApproved(updated, createdProject.id).catch((error) => {
    console.error("[prRequests] notifyRequesterApproved failed:", error instanceof Error ? error.message : error);
  });

  return toPRRequestDto(updated);
}

/**
 * Reject — reachable from EITHER pending stage, but only by whoever is
 * authorized for the request's CURRENT stage (same identity checks as the
 * matching approve action). Never reachable once a request is already
 * Approved or Rejected.
 */
export async function rejectPRRequest(id: string, actor: AccessTokenPayload, reason: string): Promise<PRRequestDto> {
  const existing = await repo.findPRRequestById(id);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }

  let fromStatus: string;
  if (existing.status === "Pending Accounts Approval") {
    if (!existing.assignedAccountsApproverId || existing.assignedAccountsApproverId !== actor.sub) {
      throw new AppError("You are not authorized to reject this request at its current stage.", 403);
    }
    fromStatus = "Pending Accounts Approval";
  } else if (existing.status === "Pending PMO Manager Approval") {
    if (existing.assignedPmoManagerId !== actor.sub) {
      throw new AppError("You are not authorized to reject this request at its current stage.", 403);
    }
    fromStatus = "Pending PMO Manager Approval";
  } else {
    throw new AppError("This request has already been finalized and cannot be rejected.", 409);
  }

  const claimed = await repo.claimStatusTransition(id, fromStatus, "Rejected");
  if (claimed.count === 0) {
    throw new AppError("This request was already actioned by another action.", 409);
  }

  await repo.recordRejection(id, actor.sub, reason);
  await repo.createApprovalHistoryEntry({ prRequestId: id, actorUserId: actor.sub, action: "Rejected", remarks: reason });

  const updated = await repo.findPRRequestById(id);
  if (!updated) {
    throw new AppError("PR Request not found.", 404);
  }

  // Fire-and-forget — see notifyAccountsApprover's call site for the full
  // reasoning. The rejection and its approval-history entry are already
  // committed above.
  void notifyRequesterRejected(updated, actor).catch((error) => {
    console.error("[prRequests] notifyRequesterRejected failed:", error instanceof Error ? error.message : error);
  });

  return toPRRequestDto(updated);
}

// ---------------------------------------------------------------------------
// Notifications + email — fire-and-forget, in-app notify() first (never
// throws, per its own contract) then a best-effort email in its own
// try/catch, matching sendAccountCreatedEmail()'s exact shape in
// users/services/user.service.ts. A failure in either must never surface as
// a failure of the state transition that already committed.
// ---------------------------------------------------------------------------

function reviewUrl(id: string): string {
  return `${env.FRONTEND_URL}/pr-requests/${id}`;
}

async function notifyAccountsApprover(request: PRRequestRow): Promise<void> {
  // Guaranteed set by this point — only called from sendToAccounts() right
  // after it atomically set this field. The check exists for TypeScript
  // (the column is nullable for Draft rows), not because this is expected
  // to ever actually be null here.
  if (!request.assignedAccountsApproverId || !request.assignedAccountsApprover) {
    console.error(`[prRequests] PR Request ${request.id} reached Pending Accounts Approval with no assigned Accounts Approver.`);
    return;
  }

  const projectData = request.projectData as unknown as PRRequestProjectDataInput;

  await notify([request.assignedAccountsApproverId], {
    title: "New PR Request awaiting your approval",
    message: `${request.requestedBy.fullName} submitted PR Request ${projectData.prNo} (${projectData.projectTitle}).`,
    type: "PR_REQUEST_SUBMITTED",
    severity: "Medium",
    entityType: "PRRequest",
    entityId: request.id,
  });

  try {
    const email = buildPRRequestSubmittedEmail({
      accountsApproverName: request.assignedAccountsApprover.fullName,
      requesterName: request.requestedBy.fullName,
      prNo: projectData.prNo,
      projectTitle: projectData.projectTitle,
      client: projectData.client,
      reviewUrl: reviewUrl(request.id),
    });
    const result = await sendEmail({ to: request.assignedAccountsApprover.email, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[prRequests] Submitted email failed for ${request.assignedAccountsApprover.email}: ${result.error}`);
    }
  } catch (error) {
    console.error("[prRequests] Unexpected error while sending Submitted email:", error instanceof Error ? error.message : error);
  }
}

async function notifyAssignedPmoManager(request: PRRequestRow): Promise<void> {
  // Guaranteed set by this point — only called from accountsApprove() right
  // after the request reaches "Pending PMO Manager Approval", which only
  // ever happens via sendToAccounts() atomically setting this field. The
  // check exists for TypeScript (the column is nullable for Draft rows), not
  // because this is expected to ever actually be null here.
  if (!request.assignedPmoManagerId || !request.assignedPmoManager) {
    console.error(`[prRequests] PR Request ${request.id} reached Pending PMO Manager Approval with no assigned PMO Manager.`);
    return;
  }

  const projectData = request.projectData as unknown as PRRequestProjectDataInput;

  await notify([request.assignedPmoManagerId], {
    title: "PR Request awaiting your approval",
    message: `PR Request ${projectData.prNo} (${projectData.projectTitle}) has cleared Accounts approval.`,
    type: "PR_REQUEST_ACCOUNTS_APPROVED",
    severity: "Medium",
    entityType: "PRRequest",
    entityId: request.id,
  });

  try {
    const email = buildPRRequestAccountsApprovedEmail({
      pmoManagerName: request.assignedPmoManager.fullName,
      requesterName: request.requestedBy.fullName,
      prNo: projectData.prNo,
      projectTitle: projectData.projectTitle,
      reviewUrl: reviewUrl(request.id),
    });
    const result = await sendEmail({ to: request.assignedPmoManager.email, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[prRequests] Accounts Approved email failed for ${request.assignedPmoManager.email}: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "[prRequests] Unexpected error while sending Accounts Approved email:",
      error instanceof Error ? error.message : error
    );
  }
}

async function notifyRequesterApproved(request: PRRequestRow, createdProjectId: string): Promise<void> {
  const projectData = request.projectData as unknown as PRRequestProjectDataInput;

  await notify([request.requestedByUserId], {
    title: "PR Request approved — Project created",
    message: `Your PR Request ${projectData.prNo} (${projectData.projectTitle}) has been approved and the Project has been created.`,
    type: "PR_REQUEST_APPROVED",
    severity: "Info",
    entityType: "Project",
    entityId: createdProjectId,
  });

  try {
    const email = buildPRRequestApprovedEmail({
      requesterName: request.requestedBy.fullName,
      prNo: projectData.prNo,
      projectTitle: projectData.projectTitle,
      projectUrl: `${env.FRONTEND_URL}/projects/edit/${createdProjectId}`,
    });
    const result = await sendEmail({ to: request.requestedBy.email, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[prRequests] Approved email failed for ${request.requestedBy.email}: ${result.error}`);
    }
  } catch (error) {
    console.error("[prRequests] Unexpected error while sending Approved email:", error instanceof Error ? error.message : error);
  }
}

async function notifyRequesterRejected(request: PRRequestRow, rejectedBy: AccessTokenPayload): Promise<void> {
  const projectData = request.projectData as unknown as PRRequestProjectDataInput;
  const rejectedByName = request.rejectedBy?.fullName ?? rejectedBy.roleName;

  await notify([request.requestedByUserId], {
    title: "PR Request rejected",
    message: `Your PR Request ${projectData.prNo} (${projectData.projectTitle}) was rejected.`,
    type: "PR_REQUEST_REJECTED",
    severity: "High",
    entityType: "PRRequest",
    entityId: request.id,
  });

  try {
    const email = buildPRRequestRejectedEmail({
      requesterName: request.requestedBy.fullName,
      prNo: projectData.prNo,
      projectTitle: projectData.projectTitle,
      rejectedByName,
      reason: request.rejectionReason ?? "",
    });
    const result = await sendEmail({ to: request.requestedBy.email, subject: email.subject, html: email.html });
    if (!result.success) {
      console.error(`[prRequests] Rejected email failed for ${request.requestedBy.email}: ${result.error}`);
    }
  } catch (error) {
    console.error("[prRequests] Unexpected error while sending Rejected email:", error instanceof Error ? error.message : error);
  }
}
