import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * RFQ No. on PR Requests (Oct 2026): stored in the request's own
 * projectData (required, trimmed) from the first Draft save, shown again
 * when the request is reopened, and carried onto the Project its approval
 * creates. A request saved before the field existed cannot be approved until
 * an RFQ No. is entered — and that failure leaves it pending, never
 * "Approved" without a Project. No email is involved (SMTP is blanked for
 * test runs). Isolated fixtures are removed in `finally`.
 */

const TAG = `prrfq-${Date.now()}`;

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
    poMonth: "2026-10", prCategory: "India", prNo, rfqNo: `RFQ-${prNo}`, client: "PR RFQ Client", department: "PMO",
    domesticForeign: "Domestic", projectTitle: `PR RFQ ${prNo}`, workOrderStatus: "Received",
    projectStartDate: "2026-10-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`,
    workOrderDate: "2026-10-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}

const withoutRfq = (data: Record<string, unknown>) => {
  const { rfqNo: _omit, ...rest } = data;
  return rest;
};

test("PR Request RFQ No.: required on the draft, restored on reopen, carried to the approved Project", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const mod = async (name: string) => (await prisma.module.findUniqueOrThrow({ where: { name } })).id;
    const approvals = await mod("Approvals");
    const projects = await mod("Projects");
    const passwordHash = await hashPassword("PrRfqTest@123");
    async function makeUser(key: string, roleName: string, modules: string[]) {
      const r = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
      const user = await prisma.portalUser.create({
        data: {
          fullName: `PrRfq ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: r.id,
          forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: r.id, roleName: r.name });
      return { user, h: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
    }
    const requester = await makeUser("requester", "PR Request User", [approvals]);
    const accounts = await makeUser("accounts", "Accounts", [approvals]);
    const pmo = await makeUser("pmo", "PMO Manager", [approvals, projects]);

    const api = async (method: string, path: string, h: Record<string, string>, body?: unknown) => {
      const res = await fetch(`${url}${path}`, { method, headers: h, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = (await res.json()) as { data?: { id: string; status?: string; projectData?: Record<string, unknown> }; message?: string };
      return { status: res.status, data: json.data, message: json.message };
    };

    let requestId = "";

    await t.test("4. Request PR with a valid RFQ No. saves it (trimmed) with the draft", async () => {
      const res = await api("POST", "/pr-requests", requester.h, { projectData: projectData(`PR-${TAG}-1`, { rfqNo: "  RFQ/2026/IFL-114  " }) });
      assert.equal(res.status, 201, res.message);
      requestId = res.data!.id;
      assert.equal(res.data!.projectData!.rfqNo, "RFQ/2026/IFL-114");
    });

    await t.test("5. Request PR without RFQ No., or with a blank one, is rejected", async () => {
      for (const [label, data] of [
        ["missing", withoutRfq(projectData(`PR-${TAG}-5a`))],
        ["empty", projectData(`PR-${TAG}-5b`, { rfqNo: "" })],
        ["whitespace", projectData(`PR-${TAG}-5c`, { rfqNo: "  " })],
      ] as const) {
        const res = await api("POST", "/pr-requests", requester.h, { projectData: data });
        assert.equal(res.status, 400, `${label} rejected`);
        assert.match(res.message!, /RFQ No\. is required/, label);
      }
      // An existing draft can't be re-saved without it either.
      const res = await api("PATCH", `/pr-requests/${requestId}`, requester.h, { projectData: withoutRfq(projectData(`PR-${TAG}-1`)) });
      assert.equal(res.status, 400);
    });

    await t.test("6. reopening the draft shows the saved RFQ No.; an edit is saved and shown again", async () => {
      assert.equal((await api("GET", `/pr-requests/${requestId}`, requester.h)).data!.projectData!.rfqNo, "RFQ/2026/IFL-114");
      const edit = await api("PATCH", `/pr-requests/${requestId}`, requester.h, { projectData: projectData(`PR-${TAG}-1`, { rfqNo: "RFQ/2026/IFL-115" }) });
      assert.equal(edit.status, 200, edit.message);
      const reopened = await api("GET", `/pr-requests/${requestId}`, requester.h);
      assert.equal(reopened.data!.projectData!.rfqNo, "RFQ/2026/IFL-115");
      assert.equal(reopened.data!.projectData!.prNo, `PR-${TAG}-1`, "other fields unchanged");
      assert.equal(reopened.data!.projectData!.client, "PR RFQ Client");
    });

    await t.test("7. approval creates the Project with the request's RFQ No.", async () => {
      const send = await api("POST", `/pr-requests/${requestId}/send-to-accounts`, requester.h, {
        assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id,
      });
      assert.equal(send.status, 200, send.message);
      assert.equal((await api("POST", `/pr-requests/${requestId}/accounts-approve`, accounts.h, {})).status, 200);
      const approve = await api("POST", `/pr-requests/${requestId}/pmo-approve`, pmo.h, {});
      assert.equal(approve.status, 200, approve.message);
      const pr = await prisma.pRRequest.findUniqueOrThrow({ where: { id: requestId } });
      assert.equal(pr.status, "Approved");
      const project = await prisma.project.findUniqueOrThrow({ where: { id: pr.createdProjectId! } });
      assert.equal(project.rfqNo, "RFQ/2026/IFL-115");
      assert.equal(project.prNo, `PR-${TAG}-1`);
      assert.equal(project.projectTitle, `PR RFQ PR-${TAG}-1`);
      // The approved request still shows its own RFQ No.
      assert.equal((await api("GET", `/pr-requests/${requestId}`, pmo.h)).data!.projectData!.rfqNo, "RFQ/2026/IFL-115");
      // Approving again is still the normal 409.
      assert.equal((await api("POST", `/pr-requests/${requestId}/pmo-approve`, pmo.h, {})).status, 409);
    });

    await t.test("older request without RFQ No.: approval refused and left pending; approves once the PMO Manager adds it", async () => {
      const prNo = `PR-${TAG}-OLD`;
      // Saved before RFQ No. existed — inserted directly, exactly as such a row looks in the database.
      const old = await prisma.pRRequest.create({
        data: {
          requestedByUserId: requester.user.id, assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id,
          status: "Pending PMO Manager Approval", projectData: { ...withoutRfq(projectData(prNo)), quantityItems: [], paymentMilestones: [] },
        },
      });
      const refused = await api("POST", `/pr-requests/${old.id}/pmo-approve`, pmo.h, {});
      assert.equal(refused.status, 400);
      assert.match(refused.message!, /cannot be approved until it is complete: RFQ No\. is required/);
      const still = await prisma.pRRequest.findUniqueOrThrow({ where: { id: old.id } });
      assert.equal(still.status, "Pending PMO Manager Approval", "not left Approved");
      assert.equal(still.createdProjectId, null);
      assert.equal(await prisma.project.count({ where: { prNo } }), 0, "no Project created");

      // The assigned PMO Manager corrects it in the review form, then approves.
      const fix = await api("PATCH", `/pr-requests/${old.id}`, pmo.h, { projectData: projectData(prNo, { rfqNo: "RFQ-OLD-77" }) });
      assert.equal(fix.status, 200, fix.message);
      assert.equal((await api("POST", `/pr-requests/${old.id}/pmo-approve`, pmo.h, {})).status, 200);
      const done = await prisma.pRRequest.findUniqueOrThrow({ where: { id: old.id } });
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: done.createdProjectId! } })).rfqNo, "RFQ-OLD-77");
    });

    await t.test("rejection never needs RFQ No.: missing or blank, at either review stage — Rejected, no Project, data untouched", async () => {
      const cases = [
        { key: "MISS", stage: "Pending PMO Manager Approval", actor: pmo, data: withoutRfq(projectData(`PR-${TAG}-RJ-MISS`)) },
        { key: "BLANK", stage: "Pending PMO Manager Approval", actor: pmo, data: projectData(`PR-${TAG}-RJ-BLANK`, { rfqNo: "   " }) },
        { key: "ACC", stage: "Pending Accounts Approval", actor: accounts, data: withoutRfq(projectData(`PR-${TAG}-RJ-ACC`)) },
      ];
      for (const c of cases) {
        const stored = { ...c.data, quantityItems: [], paymentMilestones: [] };
        const row = await prisma.pRRequest.create({
          data: {
            requestedByUserId: requester.user.id, assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id,
            status: c.stage, projectData: stored,
          },
        });
        // Approval is still refused for the PMO-stage ones (and leaves them pending).
        if (c.stage === "Pending PMO Manager Approval") {
          const approve = await api("POST", `/pr-requests/${row.id}/pmo-approve`, pmo.h, {});
          assert.equal(approve.status, 400, `${c.key}: approval blocked`);
          assert.match(approve.message!, /RFQ No\. is required/);
          assert.equal((await prisma.pRRequest.findUniqueOrThrow({ where: { id: row.id } })).status, c.stage, `${c.key}: still pending`);
        }

        const reject = await api("POST", `/pr-requests/${row.id}/reject`, c.actor.h, { reason: "Incomplete request — no RFQ" });
        assert.equal(reject.status, 200, `${c.key}: ${reject.message}`);
        const after = await prisma.pRRequest.findUniqueOrThrow({ where: { id: row.id } });
        assert.equal(after.status, "Rejected", c.key);
        assert.equal(after.createdProjectId, null, `${c.key}: no project linked`);
        assert.equal(await prisma.project.count({ where: { prNo: c.data.prNo as string } }), 0, `${c.key}: no project created`);
        assert.deepEqual(after.projectData, JSON.parse(JSON.stringify(stored)), `${c.key}: stored data not rewritten`);
        // Finalized: a later approval attempt is the normal 409, never a Project.
        assert.equal((await api("POST", `/pr-requests/${row.id}/pmo-approve`, pmo.h, {})).status, 409);
      }
    });

    await t.test("rejection keeps its other rules: reason required, only the assigned reviewer", async () => {
      const row = await prisma.pRRequest.create({
        data: {
          requestedByUserId: requester.user.id, assignedAccountsApproverId: accounts.user.id, assignedPmoManagerId: pmo.user.id,
          status: "Pending PMO Manager Approval", projectData: { ...withoutRfq(projectData(`PR-${TAG}-RJ-RULES`)), quantityItems: [], paymentMilestones: [] },
        },
      });
      assert.equal((await api("POST", `/pr-requests/${row.id}/reject`, pmo.h, { reason: "  " })).status, 400, "reason still required");
      assert.equal((await api("POST", `/pr-requests/${row.id}/reject`, accounts.h, { reason: "not mine" })).status, 403, "wrong stage reviewer");
      assert.equal((await api("POST", `/pr-requests/${row.id}/reject`, requester.h, { reason: "self" })).status, 403, "requester cannot");
      assert.equal((await prisma.pRRequest.findUniqueOrThrow({ where: { id: row.id } })).status, "Pending PMO Manager Approval");
    });
  } finally {
    await close();
    const prs = await prisma.pRRequest.findMany({ where: { requestedByUserId: { in: createdUserIds } }, select: { createdProjectId: true } });
    for (const p of prs) if (p.createdProjectId) await prisma.project.delete({ where: { id: p.createdProjectId } }).catch(() => undefined);
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
