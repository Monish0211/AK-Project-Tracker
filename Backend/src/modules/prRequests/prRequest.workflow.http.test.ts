import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * PR Request & Two-Level Approval Workflow — end-to-end over real HTTP, a
 * real Postgres database, and real JWTs (same harness as
 * users/projectManagerScope.crud.test.ts). Covers: Draft save/edit/delete
 * never creates a Project or notifies anyone; Send to Accounts is a
 * separate action (picks the PMO Manager, starts the approval chain); the
 * Accounts -> PMO Manager stage sequence; identity-based authorization at
 * each stage (not just role-name); the Approvals queue only ever showing a
 * caller items THEY can act on; a retried/duplicate approval at either stage
 * being rejected instead of creating a second Project; Quantity/Payment
 * Milestone data captured in the Draft being replayed onto the real Project
 * at final approval; and Requester Data Privacy (a PR Request User sees only
 * their own submissions).
 */

const TAG = `pr-req-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

function buildProjectData(prNo: string, projectTitle: string, includeChildren = false) {
  return {
    poMonth: "January 2026",
    prCategory: "India",
    prNo,
    client: "Test Client Pvt Ltd",
    department: "PMO",
    domesticForeign: "Domestic",
    projectTitle,
    workOrderStatus: "Received",
    projectStartDate: "2026-01-01",
    projectStatus: "Not Started",
    workOrderNumber: `WO-${prNo}`,
    workOrderDate: "2026-01-01",
    rfqNo: "RFQ-TEST",
    eicName: "Test EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "Test Coordinator",
    ...(includeChildren
      ? {
          quantityItems: [
            { description: "Engineering Services", woQty: 10, uom: "NOS", currency: "INR", unitRate: 1000, exchangeRate: 1 },
          ],
          paymentMilestones: [{ milestoneName: "Advance", paymentPercentage: 100, dueDate: "2026-02-01" }],
        }
      : {}),
  };
}

test("PR Request & Two-Level Approval Workflow — submission, approval chain, exactly-once Project creation, privacy", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [administratorRole, pmoManagerRole, accountsRole, prRequestUserRole, approvalsModule, prRequestModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
    ]);
    const passwordHash = await hashPassword("PrRequestTest@123");

    async function createUser(label: string, roleId: string, roleName: string, withApprovalsModule: boolean, withPrRequestModule = false) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PR Request Test ${label}`,
          email: `${TAG}-${label.toLowerCase().replace(/\s+/g, "-")}@example.com`,
          passwordHash,
          department: "PMO",
          roleId,
          forcePasswordChange: false,
          // "PR Request" = submitting (Draft create/edit/delete, Send to Accounts); "Approvals" = reviewing. Independent grants.
          moduleAccess: {
            create: [
              ...(withApprovalsModule ? [{ moduleId: approvalsModule.id }] : []),
              ...(withPrRequestModule ? [{ moduleId: prRequestModule.id }] : []),
            ],
          },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName }) };
    }

    // Administrator does NOT automatically bypass the "Approvals" module
    // grant, same rule as every other module-gated route in this codebase
    // (see project.routes.ts's Archive/Permanent Delete comments) — must
    // hold the grant explicitly to exercise oversight (detail view) below.
    const admin = await createUser("Admin", administratorRole.id, administratorRole.name, true);
    const requester = await createUser("Requester", prRequestUserRole.id, prRequestUserRole.name, true, true);
    const otherRequester = await createUser("Other Requester", prRequestUserRole.id, prRequestUserRole.name, true, true);
    const accountsApprover = await createUser("Accounts", accountsRole.id, accountsRole.name, true);
    const pmoManager = await createUser("PMO Manager", pmoManagerRole.id, pmoManagerRole.name, true);
    const otherPmoManager = await createUser("Other PMO Manager", pmoManagerRole.id, pmoManagerRole.name, true);

    // ---- GET /users/by-role is reachable by a low-privilege PR Request
    // User (no Users module access) and returns only the requested role. ----
    const byRoleRes = await fetch(`${url}/users/by-role?role=${encodeURIComponent("PMO Manager")}`, {
      headers: { Authorization: `Bearer ${requester.token}` },
    });
    assert.equal(byRoleRes.status, 200);
    const byRoleJson = (await byRoleRes.json()) as ApiEnvelope<{ id: string; fullName: string }[]>;
    assert.ok(byRoleJson.data!.some((u) => u.id === pmoManager.id));

    // ---- Omitting `role` returns every active user — the Assigned Accounts
    // Approver picker deliberately shows everyone, not just Accounts-role
    // users (confirmed business decision). ----
    const allUsersRes = await fetch(`${url}/users/by-role`, { headers: { Authorization: `Bearer ${requester.token}` } });
    assert.equal(allUsersRes.status, 200);
    const allUsersJson = (await allUsersRes.json()) as ApiEnvelope<{ id: string; fullName: string }[]>;
    assert.ok(allUsersJson.data!.some((u) => u.id === accountsApprover.id));
    assert.ok(allUsersJson.data!.some((u) => u.id === pmoManager.id), "The all-users list is not filtered by role at all.");

    // ---- 1. Save a Draft — must NOT create a Project, notify anyone, or
    // write any approval history (private staging area, matching Add
    // Project's own "General/Quantity/Payments/Budget with no per-tab
    // backend gate" behavior). Includes a Quantity item and a Payment
    // Milestone, which cannot be persisted as real child rows yet (no
    // Project exists) and must be captured in the Draft's own JSON. ----
    const prNo = `PR-${TAG}-1`;
    const draftRes = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Workflow Test Project (draft title)", true) }),
    });
    assert.equal(draftRes.status, 201);
    const draftJson = (await draftRes.json()) as ApiEnvelope<{ id: string; status: string; assignedPmoManagerId: string | null }>;
    const requestId = draftJson.data!.id;
    assert.equal(draftJson.data!.status, "Draft");
    assert.equal(draftJson.data!.assignedPmoManagerId, null);

    const projectAfterDraft = await prisma.project.findFirst({ where: { prNo } });
    assert.equal(projectAfterDraft, null, "Saving a Draft must never create a Project.");

    const historyAfterDraftRes = await fetch(`${url}/pr-requests/${requestId}`, { headers: { Authorization: `Bearer ${requester.token}` } });
    const historyAfterDraftJson = (await historyAfterDraftRes.json()) as ApiEnvelope<{ approvalHistory: unknown[] }>;
    assert.equal(historyAfterDraftJson.data!.approvalHistory.length, 0, "A Draft has no approval history yet.");

    // A Draft is private — an unrelated PR Request User cannot see it, even
    // via direct id (privacy applies from the very first moment, not just
    // once it's actually submitted).
    const draftPrivacyRes = await fetch(`${url}/pr-requests/${requestId}`, { headers: { Authorization: `Bearer ${otherRequester.token}` } });
    assert.equal(draftPrivacyRes.status, 403);

    // ---- 2. Edit the Draft — only the owner, only while still a Draft. ----
    const editDraftRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Workflow Test Project", true) }),
    });
    assert.equal(editDraftRes.status, 200);
    const editDraftJson = (await editDraftRes.json()) as ApiEnvelope<{ projectData: { projectTitle: string } }>;
    assert.equal(editDraftJson.data!.projectData.projectTitle, "Workflow Test Project");

    const otherEditDraftRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherRequester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Hijacked", true) }),
    });
    assert.equal(otherEditDraftRes.status, 403, "Only the Draft's own requester may edit it.");

    // ---- 3. Send to Accounts — the real submission action, separate from
    // the Draft form. This is where the requester picks BOTH the Assigned
    // Accounts Approver and the Assigned PMO Manager, and where the approval
    // chain actually starts. ----
    const badPmoRes = await fetch(`${url}/pr-requests/${requestId}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: accountsApprover.id }),
    });
    assert.equal(badPmoRes.status, 400, "The selected PMO Manager must actually hold the PMO Manager role.");

    const badAccountsRes = await fetch(`${url}/pr-requests/${requestId}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: "00000000-0000-0000-0000-000000000000", assignedPmoManagerId: pmoManager.id }),
    });
    assert.equal(badAccountsRes.status, 400, "The selected Accounts Approver must be a real, active user.");

    const sendToAccountsRes = await fetch(`${url}/pr-requests/${requestId}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    assert.equal(sendToAccountsRes.status, 200);
    const sendToAccountsJson = (await sendToAccountsRes.json()) as ApiEnvelope<{
      status: string;
      assignedAccountsApproverId: string;
      assignedPmoManagerId: string;
    }>;
    assert.equal(sendToAccountsJson.data!.status, "Pending Accounts Approval");
    assert.equal(sendToAccountsJson.data!.assignedAccountsApproverId, accountsApprover.id);
    assert.equal(sendToAccountsJson.data!.assignedPmoManagerId, pmoManager.id);

    // Once sent, it's no longer a Draft — the ORIGINAL REQUESTER can no
    // longer edit it (403: they're not the assigned approver for its
    // current stage — only Accounts/PMO Manager may edit from here, see the
    // approver-edit assertions below), and re-sending is rejected outright
    // (409: it's not a Draft anymore, for anyone).
    const editAfterSendRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Too Late", true) }),
    });
    assert.equal(editAfterSendRes.status, 403);

    const resendRes = await fetch(`${url}/pr-requests/${requestId}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    assert.equal(resendRes.status, 409);

    // ---- 2. Approvals queue: only the designated Accounts approver (and
    // Administrator) sees a Pending-Accounts-Approval item; the assigned PMO
    // Manager does not yet, and an unrelated PMO Manager never does. ----
    const accountsQueueRes = await fetch(`${url}/pr-requests/queue`, { headers: { Authorization: `Bearer ${accountsApprover.token}` } });
    const accountsQueueJson = (await accountsQueueRes.json()) as ApiEnvelope<{ id: string }[]>;
    assert.ok(accountsQueueJson.data!.some((r) => r.id === requestId));

    const pmoQueueTooEarlyRes = await fetch(`${url}/pr-requests/queue`, { headers: { Authorization: `Bearer ${pmoManager.token}` } });
    const pmoQueueTooEarlyJson = (await pmoQueueTooEarlyRes.json()) as ApiEnvelope<{ id: string }[]>;
    assert.ok(!pmoQueueTooEarlyJson.data!.some((r) => r.id === requestId));

    // ---- 3. An unrelated PMO Manager cannot approve at the Accounts stage. ----
    const wrongStageApproveRes = await fetch(`${url}/pr-requests/${requestId}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherPmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(wrongStageApproveRes.status, 403);

    // ---- 3b. The assigned Accounts Approver may correct data while
    // reviewing it (before deciding) — an unrelated user may not, and this
    // is logged as an "Edited" history entry. ----
    const unrelatedEditWhilePendingRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherRequester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Hijacked During Review", true) }),
    });
    assert.equal(unrelatedEditWhilePendingRes.status, 403);

    const accountsEditRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Corrected By Accounts", true) }),
    });
    assert.equal(accountsEditRes.status, 200);
    const accountsEditJson = (await accountsEditRes.json()) as ApiEnvelope<{ projectData: { projectTitle: string } }>;
    assert.equal(accountsEditJson.data!.projectData.projectTitle, "Corrected By Accounts");

    // ---- 4. Accounts approves — moves to Pending PMO Manager Approval. ----
    const accountsApproveRes = await fetch(`${url}/pr-requests/${requestId}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(accountsApproveRes.status, 200);
    const accountsApproveJson = (await accountsApproveRes.json()) as ApiEnvelope<{ status: string }>;
    assert.equal(accountsApproveJson.data!.status, "Pending PMO Manager Approval");

    // ---- 5. Retried Accounts approval on the same request is rejected —
    // proves the claim mechanism, not just a plain existence check. ----
    const retryAccountsApproveRes = await fetch(`${url}/pr-requests/${requestId}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(retryAccountsApproveRes.status, 409);

    const detailRes = await fetch(`${url}/pr-requests/${requestId}`, { headers: { Authorization: `Bearer ${admin.token}` } });
    const detailJson = (await detailRes.json()) as ApiEnvelope<{ approvalHistory: { action: string }[] }>;
    assert.deepEqual(
      detailJson.data!.approvalHistory.map((h) => h.action),
      ["Submitted", "Edited", "AccountsApproved"]
    );

    // ---- 6. Now the assigned PMO Manager sees it; the unrelated PMO
    // Manager still never does. ----
    const pmoQueueRes = await fetch(`${url}/pr-requests/queue`, { headers: { Authorization: `Bearer ${pmoManager.token}` } });
    const pmoQueueJson = (await pmoQueueRes.json()) as ApiEnvelope<{ id: string }[]>;
    assert.ok(pmoQueueJson.data!.some((r) => r.id === requestId));

    const otherPmoQueueRes = await fetch(`${url}/pr-requests/queue`, { headers: { Authorization: `Bearer ${otherPmoManager.token}` } });
    const otherPmoQueueJson = (await otherPmoQueueRes.json()) as ApiEnvelope<{ id: string }[]>;
    assert.ok(!otherPmoQueueJson.data!.some((r) => r.id === requestId));

    // ---- 6b. The assigned PMO Manager may also correct data while
    // reviewing — same capability, now at the second stage. This is the
    // exact real-world bug found in manual testing: the frontend's Approve
    // button now ALWAYS PATCHes the current on-screen state before calling
    // this approve endpoint (see PRRequestReviewFormButtons.tsx), so an
    // edit is never lost just because the reviewer went straight to
    // Approve instead of clicking a separate Save first. Verified below by
    // confirming this edited title actually lands on the real Project. ----
    const pmoEditRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Corrected By PMO Manager", true) }),
    });
    assert.equal(pmoEditRes.status, 200);

    // A second PATCH with data IDENTICAL to what's already stored (exactly
    // what the frontend's "always save before approving" now does even when
    // the reviewer made no real change) must NOT log a spurious "Edited"
    // entry — only a genuine change belongs in the audit trail.
    const pmoNoOpEditRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Corrected By PMO Manager", true) }),
    });
    assert.equal(pmoNoOpEditRes.status, 200);

    // ---- 7. PMO Manager approves — creates the real Project. ----
    const pmoApproveRes = await fetch(`${url}/pr-requests/${requestId}/pmo-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(pmoApproveRes.status, 200);
    const pmoApproveJson = (await pmoApproveRes.json()) as ApiEnvelope<{ status: string; createdProjectId: string }>;
    assert.equal(pmoApproveJson.data!.status, "Approved");
    assert.ok(pmoApproveJson.data!.createdProjectId);
    createdProjectIds.push(pmoApproveJson.data!.createdProjectId);

    const createdProject = await prisma.project.findUnique({ where: { id: pmoApproveJson.data!.createdProjectId } });
    assert.ok(createdProject);
    assert.equal(createdProject!.prNo, prNo);
    assert.equal(createdProject!.createdByUserId, pmoManager.id);
    assert.equal(
      createdProject!.projectTitle,
      "Corrected By PMO Manager",
      "The PMO Manager's own review-time correction must be the data that actually lands on the real Project."
    );

    // Full audit trail: exactly one "Edited" per stage that had a REAL
    // change (Accounts, then PMO Manager) — the no-op PATCH just above must
    // not have added a second, spurious "Edited" entry.
    const finalHistoryRes = await fetch(`${url}/pr-requests/${requestId}`, { headers: { Authorization: `Bearer ${admin.token}` } });
    const finalHistoryJson = (await finalHistoryRes.json()) as ApiEnvelope<{ approvalHistory: { action: string }[] }>;
    assert.deepEqual(
      finalHistoryJson.data!.approvalHistory.map((h) => h.action),
      ["Submitted", "Edited", "AccountsApproved", "Edited", "PmoManagerApproved"]
    );

    // The Draft's captured Quantity item and Payment Milestone (which could
    // never be persisted as real child rows before this moment — both
    // require a real projectId FK) must have been replayed onto the new
    // Project.
    const [replayedQuantity, replayedMilestones] = await Promise.all([
      prisma.quantityItem.findMany({ where: { projectId: createdProject!.id } }),
      prisma.paymentMilestone.findMany({ where: { projectId: createdProject!.id } }),
    ]);
    assert.equal(replayedQuantity.length, 1);
    assert.equal(replayedQuantity[0]!.description, "Engineering Services");
    assert.equal(replayedMilestones.length, 1);
    assert.equal(replayedMilestones[0]!.milestoneName, "Advance");

    // ---- 8. Retried PMO Manager approval never creates a second Project. ----
    const retryPmoApproveRes = await fetch(`${url}/pr-requests/${requestId}/pmo-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(retryPmoApproveRes.status, 409);

    const projectCountByPrNo = await prisma.project.count({ where: { prNo } });
    assert.equal(projectCountByPrNo, 1, "A retried approval must never create a second Project for the same PR Request.");

    // ---- 8b. Once finalized (Approved), nobody — not even the PMO Manager
    // who just approved it — can edit it any further. ----
    const editAfterApprovedRes = await fetch(`${url}/pr-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Too Late To Edit", true) }),
    });
    assert.equal(editAfterApprovedRes.status, 409);

    // ---- 9. Requester Data Privacy — the requester's own list shows the
    // fully-approved request; an unrelated PR Request User sees nothing and
    // is denied direct access to the detail endpoint. ----
    const mineRes = await fetch(`${url}/pr-requests/mine`, { headers: { Authorization: `Bearer ${requester.token}` } });
    const mineJson = (await mineRes.json()) as ApiEnvelope<{ id: string; status: string; createdProjectId: string | null }[]>;
    const mineEntry = mineJson.data!.find((r) => r.id === requestId);
    assert.ok(mineEntry);
    assert.equal(mineEntry!.status, "Approved");
    assert.equal(mineEntry!.createdProjectId, pmoApproveJson.data!.createdProjectId);

    const otherMineRes = await fetch(`${url}/pr-requests/mine`, { headers: { Authorization: `Bearer ${otherRequester.token}` } });
    const otherMineJson = (await otherMineRes.json()) as ApiEnvelope<{ id: string }[]>;
    assert.ok(!otherMineJson.data!.some((r) => r.id === requestId));

    const forbiddenDetailRes = await fetch(`${url}/pr-requests/${requestId}`, { headers: { Authorization: `Bearer ${otherRequester.token}` } });
    assert.equal(forbiddenDetailRes.status, 403);

    // ---- 10. Reject path — a second request, rejected by Accounts. ----
    const prNo2 = `PR-${TAG}-2`;
    const draftRes2 = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo2, "Reject Test Project") }),
    });
    const draftJson2 = (await draftRes2.json()) as ApiEnvelope<{ id: string }>;
    const requestId2 = draftJson2.data!.id;
    const sendToAccountsRes2 = await fetch(`${url}/pr-requests/${requestId2}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    assert.equal(sendToAccountsRes2.status, 200);

    const rejectRes = await fetch(`${url}/pr-requests/${requestId2}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({ reason: "Budget not approved for this quarter." }),
    });
    assert.equal(rejectRes.status, 200);
    const rejectJson = (await rejectRes.json()) as ApiEnvelope<{ status: string; rejectionReason: string }>;
    assert.equal(rejectJson.data!.status, "Rejected");
    assert.equal(rejectJson.data!.rejectionReason, "Budget not approved for this quarter.");

    const projectAfterReject = await prisma.project.findFirst({ where: { prNo: prNo2 } });
    assert.equal(projectAfterReject, null, "A rejected PR Request must never create a Project.");

    // A finalized (Rejected) request can no longer be actioned by anyone.
    const rejectAgainRes = await fetch(`${url}/pr-requests/${requestId2}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({ reason: "Retry." }),
    });
    assert.equal(rejectAgainRes.status, 409);

    // ---- 11. Draft delete — a throwaway third Draft, discarded before ever
    // being sent to Accounts. Only the owner, only while still a Draft. ----
    const prNo3 = `PR-${TAG}-3`;
    const draftRes3 = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo3, "Discarded Draft") }),
    });
    const draftJson3 = (await draftRes3.json()) as ApiEnvelope<{ id: string }>;
    const requestId3 = draftJson3.data!.id;

    const forbiddenDeleteRes = await fetch(`${url}/pr-requests/${requestId3}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherRequester.token}` },
    });
    assert.equal(forbiddenDeleteRes.status, 403);

    const deleteRes = await fetch(`${url}/pr-requests/${requestId3}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${requester.token}` },
    });
    assert.equal(deleteRes.status, 200);

    const afterDeleteRes = await fetch(`${url}/pr-requests/${requestId3}`, { headers: { Authorization: `Bearer ${requester.token}` } });
    assert.equal(afterDeleteRes.status, 404);
  } finally {
    await close();
    // PRRequest rows cascade-delete their own approval history; deleting the
    // Project first avoids the PRRequest.createdProjectId FK (onDelete:
    // SetNull) leaving a dangling reference during teardown.
    for (const projectId of createdProjectIds) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    }
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: createdUserIds } } });
    for (const userId of createdUserIds) {
      await prisma.portalUser.delete({ where: { id: userId } }).catch(() => undefined);
    }
  }
});

/**
 * Recipient isolation — proves, against the real persisted Notification
 * table (not just an API-level 403), that each PR Request lifecycle event
 * notifies exactly the one intended user and nobody else, and that a
 * rejected retry (409) never inserts a duplicate Notification row. This is
 * the one gap the workflow test above didn't cover: it proves the *action*
 * is denied to the wrong caller, but never inspected who actually received a
 * Notification row for the calls that DID succeed.
 */
test("PR Request notifications — recipient isolation and no duplicates on retry", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const RTAG = `pr-notif-${Date.now()}`;

  try {
    const [pmoManagerRole, accountsRole, prRequestUserRole, approvalsModule, prRequestModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
    ]);
    const passwordHash = await hashPassword("PrRequestNotifTest@123");

    async function createUser(label: string, roleId: string, roleName: string, canSubmit = false) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PR Notif Test ${label}`,
          email: `${RTAG}-${label.toLowerCase().replace(/\s+/g, "-")}@example.com`,
          passwordHash,
          department: "PMO",
          roleId,
          forcePasswordChange: false,
          moduleAccess: { create: [{ moduleId: approvalsModule.id }, ...(canSubmit ? [{ moduleId: prRequestModule.id }] : [])] },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName }) };
    }

    const requester = await createUser("Requester", prRequestUserRole.id, prRequestUserRole.name, true);
    const accountsApprover = await createUser("Accounts", accountsRole.id, accountsRole.name);
    const otherAccountsApprover = await createUser("Other Accounts", accountsRole.id, accountsRole.name);
    const pmoManager = await createUser("PMO Manager", pmoManagerRole.id, pmoManagerRole.name);
    const otherPmoManager = await createUser("Other PMO Manager", pmoManagerRole.id, pmoManagerRole.name);

    /**
     * PR Request notifiers are dispatched fire-and-forget so the approval
     * endpoints no longer wait on SMTP/web-push (see the `void notifyX(...)`
     * call sites in prRequest.service.ts). A Notification row can therefore
     * land shortly AFTER the HTTP call returns, which this helper waits for.
     *
     * It deliberately does NOT return as soon as the first row appears: after
     * the expected row arrives it waits once more and re-reads, so a late
     * DUPLICATE still shows up in the returned set rather than being hidden
     * by an early return. Every assertion against this helper is unchanged —
     * only the read is now timing-tolerant.
     */
    async function notificationsFor(entityId: string, type: string, expected = 1) {
      const read = () => prisma.notification.findMany({ where: { entityId, type }, select: { userId: true } });
      const deadline = Date.now() + 5_000;

      let rows = await read();
      while (rows.length < expected && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        rows = await read();
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      return read();
    }

    // ---- A. Send to Accounts -> ONLY the assigned Accounts approver gets
    // PR_REQUEST_SUBMITTED. Neither the other Accounts user nor the assigned
    // PMO Manager (whose stage hasn't started yet) gets anything. ----
    const prNo = `PR-${RTAG}-1`;
    const draftRes = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo, "Notification Isolation Test") }),
    });
    const draftJson = (await draftRes.json()) as ApiEnvelope<{ id: string }>;
    const requestId = draftJson.data!.id;

    const sendToAccountsRes = await fetch(`${url}/pr-requests/${requestId}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    assert.equal(sendToAccountsRes.status, 200);

    const submittedNotifs = await notificationsFor(requestId, "PR_REQUEST_SUBMITTED");
    assert.equal(submittedNotifs.length, 1, "Exactly one PR_REQUEST_SUBMITTED notification must exist.");
    assert.equal(submittedNotifs[0]!.userId, accountsApprover.id, "Only the assigned Accounts approver may receive it.");
    assert.ok(
      !submittedNotifs.some((n) => n.userId === otherAccountsApprover.id),
      "An unrelated Accounts user must never receive this notification."
    );
    assert.ok(
      !submittedNotifs.some((n) => n.userId === pmoManager.id),
      "The assigned PMO Manager must not be notified before the Accounts stage clears."
    );

    // ---- B. Accounts approves -> ONLY the assigned PMO Manager gets
    // PR_REQUEST_ACCOUNTS_APPROVED. The other PMO Manager gets nothing. ----
    const accountsApproveRes = await fetch(`${url}/pr-requests/${requestId}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(accountsApproveRes.status, 200);

    const accountsApprovedNotifs = await notificationsFor(requestId, "PR_REQUEST_ACCOUNTS_APPROVED");
    assert.equal(accountsApprovedNotifs.length, 1);
    assert.equal(accountsApprovedNotifs[0]!.userId, pmoManager.id);
    assert.ok(
      !accountsApprovedNotifs.some((n) => n.userId === otherPmoManager.id),
      "An unrelated PMO Manager must never receive this notification."
    );

    // Retry (already claimed — 409) must NOT insert a duplicate row.
    const retryAccountsApproveRes = await fetch(`${url}/pr-requests/${requestId}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(retryAccountsApproveRes.status, 409);
    const accountsApprovedNotifsAfterRetry = await notificationsFor(requestId, "PR_REQUEST_ACCOUNTS_APPROVED");
    assert.equal(accountsApprovedNotifsAfterRetry.length, 1, "A rejected retry must never create a duplicate notification.");

    // ---- C. PMO Manager approves -> ONLY the original requester gets
    // PR_REQUEST_APPROVED, addressed against the newly-created Project. ----
    const pmoApproveRes = await fetch(`${url}/pr-requests/${requestId}/pmo-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(pmoApproveRes.status, 200);
    const pmoApproveJson = (await pmoApproveRes.json()) as ApiEnvelope<{ createdProjectId: string }>;
    const createdProjectId = pmoApproveJson.data!.createdProjectId;
    createdProjectIds.push(createdProjectId);

    const approvedNotifs = await notificationsFor(createdProjectId, "PR_REQUEST_APPROVED");
    assert.equal(approvedNotifs.length, 1);
    assert.equal(approvedNotifs[0]!.userId, requester.id, "Only the original requester receives the final approval notification.");
    assert.ok(!approvedNotifs.some((n) => n.userId === pmoManager.id || n.userId === accountsApprover.id));

    // Retry (already Approved — 409) must NOT insert a duplicate row.
    const retryPmoApproveRes = await fetch(`${url}/pr-requests/${requestId}/pmo-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(retryPmoApproveRes.status, 409);
    const approvedNotifsAfterRetry = await notificationsFor(createdProjectId, "PR_REQUEST_APPROVED");
    assert.equal(approvedNotifsAfterRetry.length, 1, "A rejected retry must never create a duplicate notification.");

    // ---- D. Accounts rejects a second request -> ONLY the requester gets
    // PR_REQUEST_REJECTED. The rejecting Accounts approver themselves gets
    // no separate notification for their own action. ----
    const prNo2 = `PR-${RTAG}-2`;
    const draftRes2 = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo2, "Accounts Reject Isolation Test") }),
    });
    const requestId2 = ((await draftRes2.json()) as ApiEnvelope<{ id: string }>).data!.id;
    await fetch(`${url}/pr-requests/${requestId2}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    const accountsRejectRes = await fetch(`${url}/pr-requests/${requestId2}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({ reason: "Notification isolation test — Accounts reject." }),
    });
    assert.equal(accountsRejectRes.status, 200);

    const accountsRejectedNotifs = await notificationsFor(requestId2, "PR_REQUEST_REJECTED");
    assert.equal(accountsRejectedNotifs.length, 1);
    assert.equal(accountsRejectedNotifs[0]!.userId, requester.id);
    assert.ok(!accountsRejectedNotifs.some((n) => n.userId === accountsApprover.id || n.userId === pmoManager.id));

    // ---- E. PMO Manager rejects a third request -> ONLY the requester gets
    // PR_REQUEST_REJECTED. ----
    const prNo3 = `PR-${RTAG}-3`;
    const draftRes3 = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo3, "PMO Reject Isolation Test") }),
    });
    const requestId3 = ((await draftRes3.json()) as ApiEnvelope<{ id: string }>).data!.id;
    await fetch(`${url}/pr-requests/${requestId3}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });
    await fetch(`${url}/pr-requests/${requestId3}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    const pmoRejectRes = await fetch(`${url}/pr-requests/${requestId3}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({ reason: "Notification isolation test — PMO Manager reject." }),
    });
    assert.equal(pmoRejectRes.status, 200);

    const pmoRejectedNotifs = await notificationsFor(requestId3, "PR_REQUEST_REJECTED");
    assert.equal(pmoRejectedNotifs.length, 1);
    assert.equal(pmoRejectedNotifs[0]!.userId, requester.id);
    assert.ok(!pmoRejectedNotifs.some((n) => n.userId === accountsApprover.id || n.userId === pmoManager.id));

    // No Project must exist for either rejected request.
    const rejectedProjects = await prisma.project.count({ where: { prNo: { in: [prNo2, prNo3] } } });
    assert.equal(rejectedProjects, 0, "A rejected PR Request must never create a Project or its notification.");
  } finally {
    await close();
    for (const projectId of createdProjectIds) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    }
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: createdUserIds } } });
    for (const userId of createdUserIds) {
      await prisma.portalUser.delete({ where: { id: userId } }).catch(() => undefined);
    }
  }
});
