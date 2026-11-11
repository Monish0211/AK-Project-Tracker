import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Project Start Date / Project End Date through the PR Request approval chain - real HTTP, real database, real JWTs.
 *
 * Root cause of "the dates are blank on the Accounts / PMO Manager review screen" was NOT in the backend: the request stores both dates and returns them at every stage as the
 * ISO timestamp of the date at UTC midnight ("2026-11-11T00:00:00.000Z"); the review form's <input type="date"> cannot show a timestamp (the frontend now cuts the date part off).
 * This test pins the backend half of that contract so it cannot drift: what is submitted is what is stored, what each approver is sent, and what the created Project holds -
 * to the exact calendar day, with no UTC / local off-by-one - and a missing end date stays missing (never replaced by today or by the approval date).
 */

const TAG = `pr-dates-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))) };
}

interface Envelope<T> { success: boolean; data?: T; message?: string }
interface RequestDto { id: string; status: string; createdProjectId: string | null; projectData: { projectStartDate: unknown; projectEndDate: unknown } }

const dateOnly = (v: unknown): string => String(v).slice(0, 10);

function payload(prNo: string, start: string | undefined, end: string | undefined | null) {
  return {
    poMonth: "2026-11", prCategory: "India", prNo, client: "Dates Client", department: "PMO", domesticForeign: "Domestic", projectTitle: `Dates ${prNo}`, workOrderStatus: "Received",
    ...(start === undefined ? {} : { projectStartDate: start }), ...(end === undefined ? {} : { projectEndDate: end }), projectStatus: "Not Started",
    workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-11-01", rfqNo: "RFQ-DATES", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Coordinator",
  };
}

test("start and end dates are stored, shown to BOTH approvers and carried onto the created Project exactly as submitted - across year, leap-day and month-end boundaries; a missing end date stays missing", async () => {
  const { url, close } = await listen();
  const userIds: string[] = [];
  const projectIds: string[] = [];
  try {
    const [prUserRole, accountsRole, pmoRole, approvals, prRequestModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
    ]);
    const passwordHash = await hashPassword("PrDates@123456");
    async function actor(label: string, role: { id: string; name: string }, modules: string[]) {
      const user = await prisma.portalUser.create({
        data: { fullName: `PR Dates ${label}`, email: `${TAG}-${label}@example.com`, passwordHash, department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } },
      });
      userIds.push(user.id);
      return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name }) };
    }
    const requester = await actor("requester", prUserRole, [approvals.id, prRequestModule.id]);
    const accounts = await actor("accounts", accountsRole, [approvals.id]);
    const pmo = await actor("pmo", pmoRole, [approvals.id]);

    const call = async <T>(who: { token: string }, method: string, path: string, body?: unknown): Promise<{ status: number; data: T | undefined; message?: string }> => {
      const res = await fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const json = (await res.json().catch(() => ({}))) as Envelope<T>;
      return { status: res.status, data: json.data, message: json.message };
    };

    const cases: Array<{ name: string; start: string; end?: string | null }> = [
      { name: "ordinary range", start: "2026-11-11", end: "2027-11-10" },
      { name: "year boundary", start: "2026-12-31", end: "2027-01-01" },
      { name: "leap day", start: "2028-02-29", end: "2028-03-01" },
      { name: "month end", start: "2026-01-31", end: "2026-02-28" },
      { name: "no end date", start: "2026-06-15" },
      { name: "end date explicitly null", start: "2026-06-16", end: null },
    ];

    for (const [i, c] of cases.entries()) {
      const prNo = `PR-DT${String(i)}${TAG.slice(-5)}`;
      const created = await call<RequestDto>(requester, "POST", "/pr-requests", { projectData: payload(prNo, c.start, c.end) });
      assert.equal(created.status, 201, `${c.name}: ${created.message}`);
      const requestId = created.data!.id;
      assert.equal(dateOnly(created.data!.projectData.projectStartDate), c.start, `${c.name}: draft keeps the start date`);

      const sent = await call(requester, "POST", `/pr-requests/${requestId}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id });
      assert.equal(sent.status, 200, `${c.name}: ${sent.message}`);

      // stage 1 - what ACCOUNTS is sent
      const atAccounts = await call<RequestDto>(accounts, "GET", `/pr-requests/${requestId}`);
      assert.equal(atAccounts.data!.status, "Pending Accounts Approval");
      assert.equal(dateOnly(atAccounts.data!.projectData.projectStartDate), c.start, `${c.name}: Accounts sees the start date`);
      if (c.end) assert.equal(dateOnly(atAccounts.data!.projectData.projectEndDate), c.end, `${c.name}: Accounts sees the end date`);
      else assert.ok(atAccounts.data!.projectData.projectEndDate == null, `${c.name}: no end date is invented (got ${String(atAccounts.data!.projectData.projectEndDate)})`);

      const accountsOk = await call(accounts, "POST", `/pr-requests/${requestId}/accounts-approve`, {});
      assert.equal(accountsOk.status, 200, `${c.name}: ${accountsOk.message}`);

      // the dates are still the same in the stored row after the transition
      const stored = await prisma.pRRequest.findUniqueOrThrow({ where: { id: requestId } });
      const storedData = stored.projectData as { projectStartDate: string; projectEndDate?: string | null };
      assert.equal(dateOnly(storedData.projectStartDate), c.start, `${c.name}: the stored request keeps the start date after Accounts approval`);
      if (c.end) assert.equal(dateOnly(storedData.projectEndDate), c.end);

      // stage 2 - what the PMO MANAGER is sent
      const atPmo = await call<RequestDto>(pmo, "GET", `/pr-requests/${requestId}`);
      assert.equal(atPmo.data!.status, "Pending PMO Manager Approval");
      assert.equal(dateOnly(atPmo.data!.projectData.projectStartDate), c.start, `${c.name}: the PMO Manager sees the start date`);
      if (c.end) assert.equal(dateOnly(atPmo.data!.projectData.projectEndDate), c.end, `${c.name}: the PMO Manager sees the end date`);

      const pmoOk = await call(pmo, "POST", `/pr-requests/${requestId}/pmo-approve`, {});
      assert.equal(pmoOk.status, 200, `${c.name}: ${pmoOk.message}`);

      // final - the created Project holds the same calendar days (compared in UTC: the value is a UTC-midnight date)
      const done = await prisma.pRRequest.findUniqueOrThrow({ where: { id: requestId } });
      assert.equal(done.status, "Approved");
      assert.ok(done.createdProjectId, `${c.name}: the project exists only after both approvals`);
      projectIds.push(done.createdProjectId!);
      const project = await prisma.project.findUniqueOrThrow({ where: { id: done.createdProjectId! } });
      assert.equal(project.projectStartDate.toISOString().slice(0, 10), c.start, `${c.name}: the project's start date`);
      if (c.end) assert.equal(project.projectEndDate?.toISOString().slice(0, 10), c.end, `${c.name}: the project's end date`);
      else assert.equal(project.projectEndDate, null, `${c.name}: no end date on the project either`);
    }
  } finally {
    await close();
    for (const id of projectIds) await prisma.project.delete({ where: { id } }).catch(() => undefined);
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: userIds } } });
    for (const id of userIds) await prisma.portalUser.delete({ where: { id } }).catch(() => undefined);
  }
});

test("a request with no start date is refused at submission (never defaulted to today), and rejection still works with the dates kept in the stored request", async () => {
  const { url, close } = await listen();
  const userIds: string[] = [];
  try {
    const [prUserRole, accountsRole, pmoRole, approvals, prRequestModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
    ]);
    const passwordHash = await hashPassword("PrDates@123456");
    async function actor(label: string, role: { id: string; name: string }, modules: string[]) {
      const user = await prisma.portalUser.create({
        data: { fullName: `PR Dates R ${label}`, email: `${TAG}-r-${label}@example.com`, passwordHash, department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } },
      });
      userIds.push(user.id);
      return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name }) };
    }
    const requester = await actor("requester", prUserRole, [approvals.id, prRequestModule.id]);
    const accounts = await actor("accounts", accountsRole, [approvals.id]);
    const pmo = await actor("pmo", pmoRole, [approvals.id]);
    const call = async (who: { token: string }, method: string, path: string, body?: unknown) => {
      const res = await fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const json = (await res.json().catch(() => ({}))) as Envelope<RequestDto>;
      return { status: res.status, data: json.data, message: json.message };
    };

    const none = await call(requester, "POST", "/pr-requests", { projectData: payload(`PR-DN${TAG.slice(-5)}`, undefined, undefined) });
    assert.equal(none.status, 400, "no start date: refused, not defaulted");
    assert.match(none.message ?? "", /Project Start Date/);

    const created = await call(requester, "POST", "/pr-requests", { projectData: payload(`PR-DR${TAG.slice(-5)}`, "2026-11-11", "2027-11-10") });
    assert.equal(created.status, 201);
    const id = created.data!.id;
    assert.equal((await call(requester, "POST", `/pr-requests/${id}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id })).status, 200);
    const rejected = await call(accounts, "POST", `/pr-requests/${id}/reject`, { reason: "Dates need a second look" });
    assert.equal(rejected.status, 200, rejected.message);
    const row = await prisma.pRRequest.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "Rejected");
    assert.equal(row.createdProjectId, null, "a rejected request never creates a project");
    const data = row.projectData as { projectStartDate: string; projectEndDate: string };
    assert.equal(dateOnly(data.projectStartDate), "2026-11-11");
    assert.equal(dateOnly(data.projectEndDate), "2027-11-10");
  } finally {
    await close();
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: userIds } } });
    for (const id of userIds) await prisma.portalUser.delete({ where: { id } }).catch(() => undefined);
  }
});
