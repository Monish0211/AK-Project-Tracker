import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { AddressInfo } from "node:net";

// Documents uploaded by this test go to a PRIVATE temp folder, never the shared storage/documents tree — other test files
// (e.g. invoiceRequestAttachments) snapshot that tree and run in parallel. The env var must be set before the app is imported.
const privateStorage = mkdtempSync(path.join(tmpdir(), "prmod-docs-"));
process.env["DOCUMENT_STORAGE_PATH"] = privateStorage;
after(() => rmSync(privateStorage, { recursive: true, force: true }));

const { default: app } = await import("../../app.js");
const { hashPassword } = await import("../../shared/utils/password.util.js");
const { prisma } = await import("../../shared/utils/prismaClient.js");
const { signAccessToken } = await import("../../shared/utils/jwt.util.js");

/**
 * "PR Request" Module Access (Oct 2026) — end-to-end over real HTTP, a real Postgres database and real JWTs.
 * "PR Request" gates SUBMITTING (create / edit / delete one's own Draft, Send to Accounts, attach documents as the requester);
 * "Approvals" keeps gating REVIEWING (queue, approve, reject, an assigned approver's corrections). Neither implies the other,
 * there is no Administrator bypass, and the existing ownership / assigned-stage checks still apply on top.
 */

const TAG = `prmod-${Date.now()}`;

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

function buildProjectData(prNo: string, projectTitle: string) {
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
  };
}

function pdfFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], name, { type: "application/pdf" });
}

test("PR Request permission — submission needs PR Request, review needs Approvals, neither implies the other", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdPrNos: string[] = [];

  try {
    const roleByName = async (name: string) => prisma.portalRole.findUniqueOrThrow({ where: { name } });
    const moduleId = async (name: string) => (await prisma.module.findUniqueOrThrow({ where: { name } })).id;
    const [prUserRole, accountsRole, pmoRole, adminRole, readOnlyRole, engineerRole] = await Promise.all(
      ["PR Request User", "Accounts", "PMO Manager", "Administrator", "Read Only", "Engineer"].map(roleByName)
    );
    const [APPROVALS, PR_REQUEST, PROJECTS] = await Promise.all(["Approvals", "PR Request", "Projects"].map(moduleId));
    const passwordHash = await hashPassword("PrModuleTest@123");

    async function makeUser(label: string, role: { id: string; name: string }, modules: string[]) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PrMod ${label}`,
          email: `${TAG}-${label}@example.com`,
          passwordHash,
          department: "PMO",
          roleId: role.id,
          forcePasswordChange: false,
          moduleAccess: { create: modules.map((id) => ({ moduleId: id })) },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName: role.name }) };
    }

    const requester = await makeUser("requester", prUserRole, [PR_REQUEST]);
    const other = await makeUser("other", prUserRole, [PR_REQUEST]);
    const neither = await makeUser("neither", prUserRole, []);
    // Accounts approver and PMO Manager hold ONLY Approvals (the PMO Manager also Projects, but NOT Add Project / PR Request):
    // approving must not need either new permission.
    const accounts = await makeUser("accounts", accountsRole, [APPROVALS]);
    const pmo = await makeUser("pmo", pmoRole, [APPROVALS, PROJECTS]);
    const adminApprovalsOnly = await makeUser("admin-approvals", adminRole, [APPROVALS]);
    const adminPrRequestOnly = await makeUser("admin-prreq", adminRole, [PR_REQUEST]);
    const readOnly = await makeUser("readonly", readOnlyRole, [PR_REQUEST, APPROVALS]);
    const both = await makeUser("both", engineerRole, [APPROVALS, PR_REQUEST]);

    async function call(method: string, path: string, who: { token: string }, body?: unknown) {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.token}` },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
      return { status: res.status, data: json.data, message: json.message };
    }
    async function upload(requestId: string, who: { token: string }, name: string) {
      const form = new FormData();
      form.append("file", pdfFile(name));
      const res = await fetch(`${url}/pr-requests/${requestId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${who.token}` },
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string } };
      if (res.status === 201 && json.data) createdDocumentIds.push(json.data.id);
      return res.status;
    }
    let n = 0;
    const newDraft = async (who: { token: string }, title: string) => {
      const prNo = `PR-${TAG}-${++n}`;
      createdPrNos.push(prNo);
      const r = await call("POST", "/pr-requests", who, { projectData: buildProjectData(prNo, title) });
      if (r.status === 201) createdRequestIds.push(r.data.id);
      return { ...r, prNo };
    };

    // ---- 1. No module at all: nothing is reachable ----
    assert.equal((await newDraft(neither, "x")).status, 403, "no modules: cannot create");
    assert.equal((await call("GET", "/pr-requests/mine", neither)).status, 403);
    assert.equal((await call("GET", "/pr-requests/queue", neither)).status, 403);
    assert.equal((await call("GET", "/projects/pmo-coordinators", neither)).status, 403);

    // ---- 2. Approvals alone does NOT allow submitting, but keeps tracking + the queue ----
    assert.equal((await newDraft(accounts, "x")).status, 403, "Approvals alone cannot submit");
    assert.equal((await call("GET", "/pr-requests/mine", accounts)).status, 200);
    assert.equal((await call("GET", "/pr-requests/queue", accounts)).status, 200);
    // No Administrator bypass in either direction.
    assert.equal((await newDraft(adminApprovalsOnly, "x")).status, 403, "Administrator with Approvals only cannot submit");
    const adminDraft = await newDraft(adminPrRequestOnly, "Admin with PR Request");
    assert.equal(adminDraft.status, 201, "Administrator holding PR Request can submit");
    assert.equal((await call("GET", "/pr-requests/queue", adminPrRequestOnly)).status, 403, "…but PR Request does not open the queue");
    // Read Only stays read only even when it holds both modules.
    assert.equal((await newDraft(readOnly, "x")).status, 403, "Read Only cannot submit even with PR Request");

    // ---- 3. PR Request alone: submit + track, but no queue / approvals ----
    const draft = await newDraft(requester, "PR Request module test");
    assert.equal(draft.status, 201);
    const requestId = draft.data.id as string;
    assert.equal((await call("GET", "/pr-requests/mine", requester)).data.some((r: { id: string }) => r.id === requestId), true);
    assert.equal((await call("GET", "/pr-requests/queue", requester)).status, 403, "PR Request does not grant the Approvals Queue");
    assert.equal((await call("GET", "/projects/pmo-coordinators", requester)).status, 200, "the draft form's coordinator picker works for PR Request");
    assert.equal((await call("GET", `/pr-requests/${requestId}`, requester)).status, 200);
    assert.equal((await call("GET", `/pr-requests/${requestId}`, other)).status, 403, "ownership still applies on top of the module");
    assert.equal((await call("PATCH", `/pr-requests/${requestId}`, requester, { projectData: buildProjectData(draft.prNo, "Edited draft") })).status, 200);
    assert.equal((await call("PATCH", `/pr-requests/${requestId}`, other, { projectData: buildProjectData(draft.prNo, "Hijack") })).status, 403);
    assert.equal(await upload(requestId, requester, "requester.pdf"), 201, "requester attaches a document");
    assert.equal((await call("GET", `/pr-requests/${requestId}/documents`, requester)).status, 200);
    assert.equal((await call("GET", `/pr-requests/${requestId}/documents`, other)).status, 403);
    assert.equal((await call("GET", `/pr-requests/${requestId}/documents`, neither)).status, 403);

    // A review-only user cannot send someone else's draft, nor submit anything.
    const sendBody = { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id };
    assert.equal((await call("POST", `/pr-requests/${requestId}/send-to-accounts`, accounts, sendBody)).status, 403);
    assert.equal((await call("DELETE", `/pr-requests/${requestId}`, accounts)).status, 403);

    // ---- 4. Requester without PR Request is stopped at the service for the shared PATCH / documents ----
    const draft2 = await newDraft(requester, "Revocation test");
    const request2Id = draft2.data.id as string;
    await prisma.userModuleAccess.deleteMany({ where: { userId: requester.id, moduleId: PR_REQUEST } });
    await prisma.userModuleAccess.create({ data: { userId: requester.id, moduleId: APPROVALS } }); // holds Approvals only now
    const revokedPatch = await call("PATCH", `/pr-requests/${request2Id}`, requester, { projectData: buildProjectData(draft2.prNo, "Too late") });
    assert.equal(revokedPatch.status, 403, "PATCH on one's own Draft needs PR Request even though the route lets Approvals through");
    assert.match(revokedPatch.message ?? "", /submit PR Requests/);
    assert.equal(await upload(request2Id, requester, "denied.pdf"), 403, "requester document upload needs PR Request");
    assert.equal((await call("DELETE", `/pr-requests/${request2Id}`, requester)).status, 403);
    assert.equal((await call("POST", `/pr-requests/${request2Id}/send-to-accounts`, requester, sendBody)).status, 403);
    assert.equal((await call("GET", `/pr-requests/${request2Id}`, requester)).status, 200, "tracking one's own request stays available");
    await prisma.userModuleAccess.deleteMany({ where: { userId: requester.id, moduleId: APPROVALS } });
    await prisma.userModuleAccess.create({ data: { userId: requester.id, moduleId: PR_REQUEST } });
    assert.equal((await call("DELETE", `/pr-requests/${request2Id}`, requester)).status, 200, "restored PR Request can delete the Draft");
    createdRequestIds.splice(createdRequestIds.indexOf(request2Id), 1);

    // ---- 5. Send to Accounts (PR Request), then the approval chain with Approvals-only approvers ----
    assert.equal((await call("POST", `/pr-requests/${requestId}/send-to-accounts`, requester, sendBody)).status, 200);
    assert.equal((await call("POST", `/pr-requests/${requestId}/accounts-approve`, requester, {})).status, 403, "PR Request never grants approval authority");
    assert.equal((await call("PATCH", `/pr-requests/${requestId}`, requester, { projectData: buildProjectData(draft.prNo, "After send") })).status, 403);

    // Assigned approver WITHOUT PR Request: sees the item, corrects it (shared PATCH), attaches a document, approves.
    assert.equal((await call("GET", "/pr-requests/queue", accounts)).data.some((r: { id: string }) => r.id === requestId), true);
    assert.equal((await call("GET", `/pr-requests/${requestId}`, accounts)).status, 200);
    assert.equal((await call("GET", `/pr-requests/${requestId}/documents`, accounts)).status, 200);
    assert.equal(await upload(requestId, accounts, "approver.pdf"), 201, "approver (Approvals only) may attach a document");
    assert.equal(
      (await call("PATCH", `/pr-requests/${requestId}`, accounts, { projectData: buildProjectData(draft.prNo, "Approver correction") })).status,
      200,
      "approver correction needs Approvals only — no PR Request"
    );
    assert.equal((await call("PATCH", `/pr-requests/${requestId}`, pmo, { projectData: buildProjectData(draft.prNo, "Not my stage") })).status, 403, "stage ownership still applies");
    assert.equal((await call("POST", `/pr-requests/${requestId}/accounts-approve`, accounts, {})).status, 200);
    assert.equal((await call("POST", `/pr-requests/${requestId}/pmo-approve`, accounts, {})).status, 403, "wrong stage / not the assigned PMO Manager");

    // PMO Manager holding neither Add Project nor PR Request still completes the chain and the Project is created.
    assert.equal(
      (await call("PATCH", `/pr-requests/${requestId}`, pmo, { projectData: buildProjectData(draft.prNo, "PMO correction") })).status,
      200
    );
    const approved = await call("POST", `/pr-requests/${requestId}/pmo-approve`, pmo, {});
    assert.equal(approved.status, 200, approved.message);
    assert.equal(approved.data.status, "Approved");
    const project = await prisma.project.findFirst({ where: { prNo: draft.prNo } });
    assert.ok(project, "approval created the Project through the service, without Add Project");
    assert.equal(project!.id, approved.data.createdProjectId);
    assert.equal((await call("POST", "/projects", pmo, { ...buildProjectData(`PR-${TAG}-direct`, "direct"), projectStatus: "Active" })).status, 403,
      "…while the same PMO Manager still cannot create a project DIRECTLY without Add Project");
    createdPrNos.push(`PR-${TAG}-direct`);

    // ---- 6. Both modules: submit AND (when assigned) review ----
    const draft3 = await newDraft(both, "Both modules");
    assert.equal(draft3.status, 201);
    assert.equal((await call("GET", "/pr-requests/queue", both)).status, 200);

    // ---- 7. Administrator-only document deletion works for an Administrator holding PR Request ----
    for (const id of createdDocumentIds.splice(0)) {
      const res = await call("DELETE", `/documents/${id}`, adminPrRequestOnly);
      assert.equal(res.status, 200, "an Administrator holding only PR Request can delete a PR document");
    }
  } finally {
    for (const id of createdDocumentIds) await prisma.document.deleteMany({ where: { id } });
    await prisma.document.deleteMany({ where: { prRequestId: { in: createdRequestIds } } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.project.deleteMany({ where: { prNo: { in: createdPrNos } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
