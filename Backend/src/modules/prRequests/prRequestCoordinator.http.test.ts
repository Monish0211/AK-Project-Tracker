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

/**
 * PR Request → Project with a PMO Coordinator: the registry pick is stored
 * with the draft (validated when it changes), linked to the coordinator's
 * ACCOUNT when the request is approved (re-validated then; an ineligible
 * account fails the approval and creates nothing), and the coordinator then
 * has the normal assigned-project access. Allocation email goes to a FAKE
 * sender only. Isolated fixtures are removed in `finally`.
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
    workOrderDate: "2026-10-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("PR Request → Project: the chosen PMO Coordinator account is linked on approval", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const sent: SendEmailOptions[] = [];
  setAllocationEmailSenderForTests(async (o) => {
    sent.push(o);
    return { success: true };
  });
  setAllocationEmailFlagForTests("true");

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
    const createDraft = async (prNo: string, extra: Record<string, unknown> = {}) => {
      const res = await api("POST", "/pr-requests", requester.h, { projectData: projectData(prNo, extra) });
      const json = (await res.json()) as { data?: { id: string; projectData: Record<string, unknown> }; message?: string };
      return { status: res.status, id: json.data?.id, data: json.data?.projectData, message: json.message };
    };
    const sendToAccounts = (id: string) =>
      api("POST", `/pr-requests/${id}/send-to-accounts`, requester.h, { assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id });

    let requestId = "";
    let projectId = "";

    await t.test("A. draft keeps the registry pick; an ineligible pick is refused at save", async () => {
      const bad = await createDraft(`PR-${TAG}-BAD`, { pmoCoordinatorEntryId: E.locked });
      assert.equal(bad.status, 400, "ineligible coordinator rejected at draft save");
      assert.match(bad.message!, /locked/);

      const d = await createDraft(`PR-${TAG}-1`, { pmoCoordinatorEntryId: E.coord, pmoCoordinator: "PrCoord Coordinator" });
      assert.equal(d.status, 201);
      requestId = d.id!;
      assert.equal(d.data!.pmoCoordinatorEntryId, E.coord, "the registry entry is stored with the draft");
      assert.equal((await sendToAccounts(requestId)).status, 200);
    });

    await t.test("C/D. approval creates the project with the coordinator ACCOUNT linked (one allocation attempt)", async () => {
      assert.equal((await api("POST", `/pr-requests/${requestId}/accounts-approve`, accounts.h, {})).status, 200);
      const before = sent.length;
      const res = await api("POST", `/pr-requests/${requestId}/pmo-approve`, pmo.h, {});
      assert.equal(res.status, 200);
      const pr = await prisma.pRRequest.findUniqueOrThrow({ where: { id: requestId } });
      assert.equal(pr.status, "Approved");
      projectId = pr.createdProjectId!;
      const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      assert.equal(project.pmoCoordinatorUserId, coord.user.id);
      assert.ok(project.pmoCoordinatorAssignedAt);
      assert.equal(project.pmoCoordinator, "PrCoord Coordinator", "display name comes from the registry");
      await sleep(400);
      const mails = sent.slice(before);
      assert.equal(mails.length, 1);
      assert.equal(mails[0]!.to, coord.user.email);
    });
    await t.test("E. the project is in the coordinator's repository; they can open and edit it", async () => {
      const listRes = await api("GET", `/projects?search=${encodeURIComponent(`PR-${TAG}-1`)}&pageSize=10`, coord.h);
      const ids = ((await listRes.json()) as { data: { items: Array<{ id: string }> } }).data.items.map((i) => i.id);
      assert.deepEqual(ids, [projectId]);
      assert.equal((await api("GET", `/projects/${projectId}`, coord.h)).status, 200);
      assert.equal((await api("PATCH", `/projects/${projectId}`, coord.h, { projectTitle: "Edited by PR coordinator" })).status, 200);
      // Read Only rules still apply: no archive / delete / reassignment.
      assert.equal((await api("DELETE", `/projects/${projectId}`, coord.h)).status, 403);
      assert.equal((await api("PATCH", `/projects/${projectId}`, coord.h, { pmoCoordinatorEntryId: E.coord2 })).status, 403);
      // Another user without access still cannot open it.
      assert.equal((await api("GET", `/projects/${projectId}`, outsider.h)).status, 403);
    });
    await t.test("G2. coordinator becomes ineligible before approval: approval fails, nothing is created", async () => {
      const d = await createDraft(`PR-${TAG}-2`, { pmoCoordinatorEntryId: E.coord2 });
      assert.equal(d.status, 201);
      assert.equal((await sendToAccounts(d.id!)).status, 200);
      assert.equal((await api("POST", `/pr-requests/${d.id}/accounts-approve`, accounts.h, {})).status, 200);
      await prisma.portalUser.update({ where: { id: coord2.user.id }, data: { accountLocked: true } });
      try {
        const before = sent.length;
        const res = await api("POST", `/pr-requests/${d.id}/pmo-approve`, pmo.h, {});
        assert.equal(res.status, 400);
        assert.match(((await res.json()) as { message: string }).message, /locked/);
        const pr = await prisma.pRRequest.findUniqueOrThrow({ where: { id: d.id! } });
        assert.equal(pr.status, "Pending PMO Manager Approval", "status rolled back for a retry");
        assert.equal(pr.createdProjectId, null);
        assert.equal(await prisma.project.count({ where: { prNo: `PR-${TAG}-2` } }), 0, "no partial project");
        await sleep(300);
        assert.equal(sent.length, before, "no allocation email");
      } finally {
        await prisma.portalUser.update({ where: { id: coord2.user.id }, data: { accountLocked: false } });
      }
      // Once the account is fixed, the same request approves normally.
      assert.equal((await api("POST", `/pr-requests/${d.id}/pmo-approve`, pmo.h, {})).status, 200);
      const created = await prisma.pRRequest.findUniqueOrThrow({ where: { id: d.id! } });
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: created.createdProjectId! } })).pmoCoordinatorUserId, coord2.user.id);
    });
    await t.test("Typed coordinator name only (no registry pick): approved project has no account link", async () => {
      const d = await createDraft(`PR-${TAG}-4`, { pmoCoordinator: "PrCoord Coordinator" });
      assert.equal(d.status, 201);
      assert.equal(d.data!.pmoCoordinatorEntryId, undefined);
      assert.equal((await sendToAccounts(d.id!)).status, 200);
      assert.equal((await api("POST", `/pr-requests/${d.id}/accounts-approve`, accounts.h, {})).status, 200);
      assert.equal((await api("POST", `/pr-requests/${d.id}/pmo-approve`, pmo.h, {})).status, 200);
      const pr = await prisma.pRRequest.findUniqueOrThrow({ where: { id: d.id! } });
      const project = await prisma.project.findUniqueOrThrow({ where: { id: pr.createdProjectId! } });
      assert.equal(project.pmoCoordinatorUserId, null);
      assert.equal((await api("GET", `/projects/${project.id}`, coord.h)).status, 403, "a matching name grants nothing");
    });
  } finally {
    setAllocationEmailFlagForTests(null);
    setAllocationEmailSenderForTests(null);
    await close();
    const prs = await prisma.pRRequest.findMany({ where: { requestedByUserId: { in: createdUserIds } }, select: { createdProjectId: true } });
    for (const p of prs) if (p.createdProjectId) await prisma.project.delete({ where: { id: p.createdProjectId } }).catch(() => undefined);
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: createdUserIds } } });
    await prisma.pmoCoordinator.deleteMany({ where: { emailNormalized: { startsWith: tagLower } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
