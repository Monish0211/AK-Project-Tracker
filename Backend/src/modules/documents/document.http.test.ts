import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Documents feature — end-to-end over real HTTP, real Postgres, real JWTs
 * and real (local test-storage-directory) file I/O. Covers: upload/list/
 * download/delete on a Project; upload/list on a PR Request Draft; the PR
 * approval re-pointing lifecycle (documents survive approval, appear under
 * the resulting Project, never duplicate, a rejection leaves them exactly
 * where they were); authorization (an unrelated user cannot list/download,
 * a guessed document id from a foreign project is still rejected, only
 * Administrator may delete); and the executable-extension denylist.
 */

const TAG = `doc-${Date.now()}`;

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

interface DocumentDto {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
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

function pdfFile(name = "invoice.pdf"): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
  return new File([bytes], name, { type: "application/pdf" });
}

test("Documents — Project upload/list/download/delete, authorization, and denylist", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [administratorRole, engineerRole, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("DocumentTest@123");

    async function createUser(label: string, roleId: string, roleName: string) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `Document Test ${label}`,
          email: `${TAG}-${label.toLowerCase().replace(/\s+/g, "-")}@example.com`,
          passwordHash,
          department: "PMO",
          roleId,
          forcePasswordChange: false,
          moduleAccess: { create: [{ moduleId: projectsModule.id }] },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName }) };
    }

    const owner = await createUser("Owner", engineerRole.id, engineerRole.name);
    const outsider = await createUser("Outsider", engineerRole.id, engineerRole.name);
    const admin = await createUser("Admin", administratorRole.id, administratorRole.name);

    const projectRes = await fetch(`${url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify(buildProjectData(`PR-${TAG}-1`, "Documents Test Project")),
    });
    assert.equal(projectRes.status, 201);
    const projectJson = (await projectRes.json()) as ApiEnvelope<{ id: string }>;
    const projectId = projectJson.data!.id;
    createdProjectIds.push(projectId);

    // ---- Upload (owner) ----
    const uploadForm = new FormData();
    uploadForm.append("file", pdfFile());
    const uploadRes = await fetch(`${url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: uploadForm,
    });
    assert.equal(uploadRes.status, 201);
    const uploadJson = (await uploadRes.json()) as ApiEnvelope<DocumentDto>;
    const documentId = uploadJson.data!.id;
    assert.equal(uploadJson.data!.fileName, "invoice.pdf");
    assert.equal(uploadJson.data!.mimeType, "application/pdf");

    const dbRowAfterUpload = await prisma.document.findUnique({ where: { id: documentId } });
    assert.ok(dbRowAfterUpload, "Document row must exist after a successful upload.");
    assert.equal(dbRowAfterUpload!.projectId, projectId);
    assert.equal(dbRowAfterUpload!.prRequestId, null);

    // ---- List (owner) — metadata only, storageKey never present in the response ----
    const listRes = await fetch(`${url}/projects/${projectId}/documents`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as ApiEnvelope<DocumentDto[]>;
    assert.equal(listJson.data!.length, 1);
    assert.equal(listJson.data![0].id, documentId);
    assert.ok(!("storageKey" in listJson.data![0]), "storageKey must never be returned in the list response.");

    // ---- Download (owner) — file bytes round-trip correctly ----
    const downloadRes = await fetch(`${url}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(downloadRes.status, 200);
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    assert.equal(Buffer.from(downloadedBytes).toString(), "%PDF-1.4");

    // ---- Security: an outsider with no Project access cannot list or download ----
    const outsiderListRes = await fetch(`${url}/projects/${projectId}/documents`, { headers: { Authorization: `Bearer ${outsider.token}` } });
    assert.equal(outsiderListRes.status, 403);
    const outsiderDownloadRes = await fetch(`${url}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${outsider.token}` } });
    assert.equal(outsiderDownloadRes.status, 403, "Guessing a real document id must not bypass Project authorization.");

    // ---- Executable-extension denylist ----
    const exeForm = new FormData();
    exeForm.append("file", new File([new Uint8Array([0x4d, 0x5a])], "totally-a-document.exe", { type: "application/octet-stream" }));
    const exeUploadRes = await fetch(`${url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: exeForm,
    });
    assert.equal(exeUploadRes.status, 400, "A .exe upload must be rejected regardless of the parent Project's authorization.");
    assert.equal(await prisma.document.count({ where: { projectId, fileName: "totally-a-document.exe" } }), 0);

    // ---- Magic-byte mismatch: a file named .pdf whose content is not a real PDF ----
    const fakePdfForm = new FormData();
    fakePdfForm.append("file", new File([new Uint8Array([0x00, 0x00, 0x00, 0x00])], "fake.pdf", { type: "application/pdf" }));
    const fakePdfRes = await fetch(`${url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: fakePdfForm,
    });
    assert.equal(fakePdfRes.status, 400, "A .pdf whose bytes do not match the PDF signature must be rejected.");

    // ---- Delete: non-Administrator (even the owner who uploaded it) is forbidden ----
    const ownerDeleteRes = await fetch(`${url}/documents/${documentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(ownerDeleteRes.status, 403, "Deletion is Administrator-only — even the uploader may not delete their own document.");
    assert.ok(await prisma.document.findUnique({ where: { id: documentId } }), "A forbidden delete attempt must not remove the row.");

    // ---- Delete: Administrator succeeds, row and physical file both go, parent Project untouched ----
    const adminDeleteRes = await fetch(`${url}/documents/${documentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminDeleteRes.status, 200);
    assert.equal(await prisma.document.findUnique({ where: { id: documentId } }), null);

    const projectStillExistsRes = await fetch(`${url}/projects/${projectId}`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(projectStillExistsRes.status, 200, "Deleting a Document must never delete its parent Project.");

    const downloadAfterDeleteRes = await fetch(`${url}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${owner.token}` } });
    assert.equal(downloadAfterDeleteRes.status, 404);
  } finally {
    await prisma.document.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

test("Documents — PR Request lifecycle: survives approval (re-pointed, not duplicated), stays put on rejection", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdPRRequestIds: string[] = [];

  try {
    const [pmoManagerRole, accountsRole, prRequestUserRole, approvalsModule, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("DocumentPrTest@123");

    async function createUser(label: string, roleId: string, roleName: string, moduleIds: string[]) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `Document PR Test ${label}`,
          email: `${TAG}-pr-${label.toLowerCase().replace(/\s+/g, "-")}@example.com`,
          passwordHash,
          department: "PMO",
          roleId,
          forcePasswordChange: false,
          moduleAccess: { create: moduleIds.map((moduleId) => ({ moduleId })) },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName }) };
    }

    const requester = await createUser("Requester", prRequestUserRole.id, prRequestUserRole.name, [approvalsModule.id]);
    const accountsApprover = await createUser("Accounts", accountsRole.id, accountsRole.name, [approvalsModule.id]);
    // A real PMO Manager holds Projects access too (they manage Projects,
    // not just PR Request approvals) — granted explicitly here since
    // Administrator does NOT auto-bypass module grants in this codebase
    // (see prRequest.workflow.http.test.ts's own comment on this).
    const pmoManager = await createUser("PMO Manager", pmoManagerRole.id, pmoManagerRole.name, [approvalsModule.id, projectsModule.id]);

    // ---- Draft 1: will be approved through both stages ----
    const prNo1 = `PR-${TAG}-approve`;
    const draft1Res = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo1, "Approved PR Documents Test") }),
    });
    assert.equal(draft1Res.status, 201);
    const draft1Json = (await draft1Res.json()) as ApiEnvelope<{ id: string }>;
    const request1Id = draft1Json.data!.id;
    createdPRRequestIds.push(request1Id);

    const upload1Form = new FormData();
    upload1Form.append("file", pdfFile("pre-approval-invoice.pdf"));
    const upload1Res = await fetch(`${url}/pr-requests/${request1Id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${requester.token}` },
      body: upload1Form,
    });
    assert.equal(upload1Res.status, 201);
    const upload1Json = (await upload1Res.json()) as ApiEnvelope<DocumentDto>;
    const document1Id = upload1Json.data!.id;

    const beforeApprovalRow = await prisma.document.findUnique({ where: { id: document1Id } });
    assert.equal(beforeApprovalRow!.prRequestId, request1Id);
    assert.equal(beforeApprovalRow!.projectId, null);

    await fetch(`${url}/pr-requests/${request1Id}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });

    const accountsApproveRes = await fetch(`${url}/pr-requests/${request1Id}/accounts-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(accountsApproveRes.status, 200);

    // Documents survive the first approval stage untouched — still PR-owned.
    const afterAccountsRow = await prisma.document.findUnique({ where: { id: document1Id } });
    assert.equal(afterAccountsRow!.prRequestId, request1Id);
    assert.equal(afterAccountsRow!.projectId, null);

    const pmoApproveRes = await fetch(`${url}/pr-requests/${request1Id}/pmo-approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${pmoManager.token}` },
      body: JSON.stringify({}),
    });
    assert.equal(pmoApproveRes.status, 200);
    const pmoApproveJson = (await pmoApproveRes.json()) as ApiEnvelope<{ createdProjectId: string }>;
    const createdProjectId = pmoApproveJson.data!.createdProjectId;
    createdProjectIds.push(createdProjectId);

    // ---- The critical assertion: re-pointed, not duplicated ----
    const afterApprovalRow = await prisma.document.findUnique({ where: { id: document1Id } });
    assert.equal(afterApprovalRow!.projectId, createdProjectId, "Document must be re-pointed onto the newly created Project.");
    assert.equal(afterApprovalRow!.prRequestId, null, "prRequestId must be cleared once re-pointed.");
    assert.equal(afterApprovalRow!.storageKey, beforeApprovalRow!.storageKey, "The physical file must never be duplicated — same storageKey before and after.");

    const totalDocsForThisFile = await prisma.document.count({ where: { fileName: "pre-approval-invoice.pdf" } });
    assert.equal(totalDocsForThisFile, 1, "Exactly one Document row must exist — approval must never create a second one.");

    const projectDocsRes = await fetch(`${url}/projects/${createdProjectId}/documents`, { headers: { Authorization: `Bearer ${pmoManager.token}` } });
    const projectDocsJson = (await projectDocsRes.json()) as ApiEnvelope<DocumentDto[]>;
    assert.ok(projectDocsJson.data!.some((d) => d.id === document1Id), "The document must appear under the resulting Project's Documents list.");

    const prDocsAfterApprovalRes = await fetch(`${url}/pr-requests/${request1Id}/documents`, { headers: { Authorization: `Bearer ${pmoManager.token}` } });
    const prDocsAfterApprovalJson = (await prDocsAfterApprovalRes.json()) as ApiEnvelope<DocumentDto[]>;
    assert.equal(prDocsAfterApprovalJson.data!.length, 0, "The document must no longer appear under the PR Request once re-pointed.");

    // ---- Draft 2: will be rejected — documents must stay exactly where they were ----
    const prNo2 = `PR-${TAG}-reject`;
    const draft2Res = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ projectData: buildProjectData(prNo2, "Rejected PR Documents Test") }),
    });
    const draft2Json = (await draft2Res.json()) as ApiEnvelope<{ id: string }>;
    const request2Id = draft2Json.data!.id;
    createdPRRequestIds.push(request2Id);

    const upload2Form = new FormData();
    upload2Form.append("file", pdfFile("rejected-quotation.pdf"));
    const upload2Res = await fetch(`${url}/pr-requests/${request2Id}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${requester.token}` },
      body: upload2Form,
    });
    const upload2Json = (await upload2Res.json()) as ApiEnvelope<DocumentDto>;
    const document2Id = upload2Json.data!.id;

    await fetch(`${url}/pr-requests/${request2Id}/send-to-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${requester.token}` },
      body: JSON.stringify({ assignedAccountsApproverId: accountsApprover.id, assignedPmoManagerId: pmoManager.id }),
    });

    const rejectRes = await fetch(`${url}/pr-requests/${request2Id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accountsApprover.token}` },
      body: JSON.stringify({ reason: "Not needed right now." }),
    });
    assert.equal(rejectRes.status, 200);

    const afterRejectRow = await prisma.document.findUnique({ where: { id: document2Id } });
    assert.equal(afterRejectRow!.prRequestId, request2Id, "A rejected PR Request's documents must remain attached to it.");
    assert.equal(afterRejectRow!.projectId, null, "A rejected PR Request's documents must never become Project documents.");
  } finally {
    await prisma.document.deleteMany({ where: { prRequestId: { in: createdPRRequestIds } } });
    await prisma.document.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: createdPRRequestIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
