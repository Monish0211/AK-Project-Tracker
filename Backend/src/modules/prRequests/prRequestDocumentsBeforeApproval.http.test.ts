import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import type { SendEmailOptions } from "../../shared/email/email.types.js";
import {
  setAllocationEmailFlagForTests,
  setAllocationEmailSenderForTests,
} from "../pmoCoordinators/services/pmoCoordinatorAllocationEmail.service.js";
import { deleteDocument } from "../documents/services/document.service.js";

/**
 * PR Request supporting documents: uploaded while the request is a draft or
 * pending, visible only to the requester / assigned approvers / Administrator,
 * moved onto the approved Project exactly once, and kept on the request when
 * it is rejected. Isolated fixtures and stored files are removed in `finally`.
 */

const TAG = `prcoord-${Date.now()}`;
const tagLower = TAG.toLowerCase();

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function projectData(prNo: string, extra: Record<string, unknown> = {}) {
  return {
    poMonth: "October 2026", prCategory: "India", prNo, client: "PR Coord Client", department: "PMO",
    domesticForeign: "Domestic", projectTitle: `PR Coord ${prNo}`, workOrderStatus: "Received",
    projectStartDate: "2026-10-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`,
    workOrderDate: "2026-10-01", rfqNo: "RFQ-TEST", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}

function pdf(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], name, { type: "application/pdf" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("PR Request documents: uploaded before approval, moved onto the project exactly once", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const sent: SendEmailOptions[] = [];
  setAllocationEmailSenderForTests(async (o) => {
    sent.push(o);
    return { success: true };
  });
  setAllocationEmailFlagForTests("false"); // documents only: no allocation email expected

  try {
    const role = async (name: string) => prisma.portalRole.findUniqueOrThrow({ where: { name } });
    const mod = async (name: string) => (await prisma.module.findUniqueOrThrow({ where: { name } })).id;
    const approvals = await mod("Approvals");
    const projects = await mod("Projects");
    const passwordHash = await hashPassword("PrCoordTest@123");
    async function makeUser(key: string, roleName: string, modules: string[], extra: Record<string, unknown> = {}) {
      const r = await role(roleName);
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PrCoord ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: r.id,
          forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) }, ...extra,
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: r.id, roleName: r.name });
      return { user, h: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, auth: { Authorization: `Bearer ${token}` } };
    }
    const requester = await makeUser("requester", "PR Request User", [approvals]);
    const outsider = await makeUser("outsider", "PR Request User", [approvals, projects]);
    const accounts = await makeUser("accounts", "Accounts", [approvals]);
    const pmo = await makeUser("pmo", "PMO Manager", [approvals, projects]);
    const coord = await makeUser("coord", "Read Only", [projects]);
    const coord2 = await makeUser("coord2", "Engineer", [projects]);
    await makeUser("locked", "Engineer", [projects], { accountLocked: true });

    const entry = async (key: string, displayName: string) =>
      (await prisma.pmoCoordinator.create({
        // createdByUserId set: fixture rows must never look like the seeded (creator-less) list.
        data: { displayName, email: `${TAG}-${key}@example.com`, emailNormalized: `${tagLower}-${key}@example.com`, createdByUserId: pmo.user.id },
      })).id;
    const E = { coord: await entry("coord", "PrCoord Coordinator"), coord2: await entry("coord2", "PrCoord Coordinator Two"), locked: await entry("locked", "PrCoord Locked") };

    const api = (method: string, path: string, h: Record<string, string>, body?: unknown) =>
      fetch(`${url}${path}`, { method, headers: h, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const upload = (prId: string, auth: Record<string, string>, name: string) => {
      const form = new FormData();
      form.append("file", pdf(name));
      return fetch(`${url}/pr-requests/${prId}/documents`, { method: "POST", headers: auth, body: form });
    };
    const createDraft = async (prNo: string, extra: Record<string, unknown> = {}) => {
      const res = await api("POST", "/pr-requests", requester.h, { projectData: projectData(prNo, extra) });
      const json = (await res.json()) as { data?: { id: string; projectData: Record<string, unknown> }; message?: string };
      return { status: res.status, id: json.data?.id, data: json.data?.projectData, message: json.message };
    };
    const sendToAccounts = (id: string) =>
      api("POST", `/pr-requests/${id}/send-to-accounts`, requester.h, { assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id });

    let requestId = "";
    let documentId = "";
    let projectId = "";

    await t.test("A/B. draft with an eligible coordinator + a document before approval", async () => {
      const bad = await createDraft(`PR-${TAG}-BAD`, { pmoCoordinatorEntryId: E.locked });
      assert.equal(bad.status, 400, "ineligible coordinator rejected at draft save");
      assert.match(bad.message!, /locked/);

      const d = await createDraft(`PR-${TAG}-1`, { pmoCoordinatorEntryId: E.coord, pmoCoordinator: "PrCoord Coordinator" });
      assert.equal(d.status, 201);
      requestId = d.id!;
      assert.equal(d.data!.pmoCoordinatorEntryId, E.coord, "the registry entry is stored with the draft");

      const up = await upload(requestId, requester.auth, `${TAG}-draft-doc.pdf`);
      assert.equal(up.status, 201);
      documentId = ((await up.json()) as { data: { id: string } }).data.id;
      const row = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      assert.equal(row.prRequestId, requestId);
      assert.equal(row.projectId, null, "attached to the request, not to any project");

      assert.equal((await sendToAccounts(requestId)).status, 200);
      // Still available while pending — to the requester and the assigned approver.
      for (const who of [requester, accounts]) {
        const list = await api("GET", `/pr-requests/${requestId}/documents`, who.h);
        assert.equal(list.status, 200);
        const items = ((await list.json()) as { data: unknown }).data as Array<{ id: string }> | { items: Array<{ id: string }> };
        const ids = (Array.isArray(items) ? items : items.items).map((x) => x.id);
        assert.deepEqual(ids, [documentId]);
      }
      // The approver may add a document while reviewing.
      assert.equal((await upload(requestId, accounts.auth, `${TAG}-review-doc.pdf`)).status, 201);
    });
    await t.test("G1. another user cannot list, upload to or download the request's documents", async () => {
      assert.equal((await api("GET", `/pr-requests/${requestId}/documents`, outsider.h)).status, 403);
      assert.equal((await upload(requestId, outsider.auth, "nope.pdf")).status, 403);
      assert.equal((await api("GET", `/documents/${documentId}/download`, outsider.h)).status, 403);
    });
    await t.test("C. both approval stages complete and create the project", async () => {
      assert.equal((await api("POST", `/pr-requests/${requestId}/accounts-approve`, accounts.h, {})).status, 200);
      assert.equal((await api("POST", `/pr-requests/${requestId}/pmo-approve`, pmo.h, {})).status, 200);
      const pr = await prisma.pRRequest.findUniqueOrThrow({ where: { id: requestId } });
      assert.equal(pr.status, "Approved");
      projectId = pr.createdProjectId!;
      assert.ok(projectId);
    });

    await t.test("F. documents moved onto the project exactly once", async () => {
      const onProject = await prisma.document.findMany({ where: { projectId } });
      assert.equal(onProject.length, 2);
      assert.ok(onProject.some((d) => d.id === documentId));
      assert.equal(await prisma.document.count({ where: { prRequestId: requestId } }), 0, "nothing left behind on the request");
      const list = await api("GET", `/projects/${projectId}/documents`, coord.h);
      assert.equal(list.status, 200, "the coordinator can see them");
      assert.equal((await api("GET", `/documents/${documentId}/download`, coord.h)).status, 200);
    });
    await t.test("G3. rejected request: no project; its documents stay with the request under the same access rules", async () => {
      const d = await createDraft(`PR-${TAG}-3`, { pmoCoordinatorEntryId: E.coord });
      const up = await upload(d.id!, requester.auth, `${TAG}-rejected-doc.pdf`);
      assert.equal(up.status, 201);
      const docId = ((await up.json()) as { data: { id: string } }).data.id;
      assert.equal((await sendToAccounts(d.id!)).status, 200);
      assert.equal((await api("POST", `/pr-requests/${d.id}/reject`, accounts.h, { reason: "Not needed" })).status, 200);
      assert.equal(await prisma.project.count({ where: { prNo: `PR-${TAG}-3` } }), 0);
      const row = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
      assert.equal(row.prRequestId, d.id);
      assert.equal(row.projectId, null);
      assert.equal((await api("GET", `/pr-requests/${d.id}/documents`, requester.h)).status, 200);
      assert.equal((await api("GET", `/pr-requests/${d.id}/documents`, outsider.h)).status, 403);
    });
  } finally {
    setAllocationEmailFlagForTests(null);
    setAllocationEmailSenderForTests(null);
    await close();
    const docs = await prisma.document.findMany({ where: { uploadedByUserId: { in: createdUserIds } }, select: { id: true } });
    for (const d of docs) await deleteDocument(d.id).catch(() => undefined);
    const prs = await prisma.pRRequest.findMany({ where: { requestedByUserId: { in: createdUserIds } }, select: { createdProjectId: true } });
    for (const p of prs) if (p.createdProjectId) await prisma.project.delete({ where: { id: p.createdProjectId } }).catch(() => undefined);
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: createdUserIds } } });
    await prisma.pmoCoordinator.deleteMany({ where: { emailNormalized: { startsWith: tagLower } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
