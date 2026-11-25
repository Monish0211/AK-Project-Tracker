import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { setEmailTransportForTests } from "../../shared/email/transporter.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Approved rule (Nov 2026): a PR Request cannot be approved - by Accounts, the PMO Manager or an administrator - while any Quantity line would be
 * rejected on the Project, so a Project is never created with lines missing. Rejecting still works. Emails are captured, never sent.
 */

const TAG = `prqty-${Date.now()}`;
let url = "";
let closeApp: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], requests: [] as string[] };
let mails = 0;

interface Actor { id: string; email: string; h: Record<string, string> }
async function makeUser(key: string, roleName: string, modules: string[]): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const email = `${TAG}-${key}@example.com`;
  const user = await prisma.portalUser.create({
    data: { fullName: `PrQty ${key}`, email, passwordHash: await hashPassword("PrQtyTest@123"), department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) } },
  });
  created.users.push(user.id);
  return { id: user.id, email, h: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: user.id, email, roleId: role.id, roleName })}` } };
}
const api = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: actor.h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message ?? "" };
};

let requester: Actor, accounts: Actor, pmo: Actor, owner: Actor;
const line = (over: Record<string, unknown> = {}) => ({ description: "Study", woQty: 2, uom: "DAY", currency: "USD", unitRate: 100, exchangeRate: 3.6725, ...over });
let seq = 0;
const data = (category: "Abu Dhabi" | "India", quantityItems: unknown[]) => {
  const prNo = `${category === "India" ? "PR-" : "PRAD-"}${TAG}-${++seq}`;
  return { poMonth: "2026-11", prCategory: category, prNo, rfqNo: `RFQ-${prNo}`, client: "Qty Client", department: "PMO", domesticForeign: "Foreign", projectTitle: `Qty ${prNo}`, workOrderStatus: "Received", projectStartDate: "2026-11-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-11-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725, quantityItems };
};
async function submitted(category: "Abu Dhabi" | "India", quantityItems: unknown[]) {
  const draft = await api(requester, "POST", "/pr-requests", { projectData: data(category, quantityItems) });
  assert.equal(draft.status, 201, draft.message);
  created.requests.push(draft.data.id);
  assert.equal((await api(requester, "POST", `/pr-requests/${draft.data.id}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id })).status, 200);
  return draft.data.id as string;
}
const row = (id: string) => prisma.pRRequest.findUniqueOrThrow({ where: { id }, select: { status: true, createdProjectId: true, projectData: true } });
/** Data saved before this rule existed: written straight to the database, as an old pending request holds it. */
async function storeLines(id: string, quantityItems: unknown[]) {
  const current = await row(id);
  await prisma.pRRequest.update({ where: { id }, data: { projectData: { ...(current.projectData as object), quantityItems } as never } });
}

before(async () => {
  setEmailTransportForTests({ sendMail: async () => { mails++; return {}; } } as never);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeApp = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  requester = await makeUser("requester", "PR Request User", ["Approvals", "PR Request"]);
  accounts = await makeUser("accounts", "Accounts", ["Approvals"]);
  pmo = await makeUser("pmo", "PMO Manager", ["Approvals", "Projects"]);
  owner = await makeUser("owner", "Administrator", ["Approvals", "Projects"]);
  await prisma.portalUser.update({ where: { id: pmo.id }, data: { allCountriesAccess: true } }).catch(() => undefined);
  process.env["ADMIN_CONTROLS_OWNER_EMAILS"] = owner.email;
});

after(async () => {
  setEmailTransportForTests(null);
  delete process.env["ADMIN_CONTROLS_OWNER_EMAILS"];
  try {
    const projects = await prisma.project.findMany({ where: { prNo: { contains: TAG } }, select: { id: true } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: created.requests } } });
    await prisma.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });
    await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeApp();
  }
});

test("Accounts cannot approve a foreign-currency line at rate 1: the message names the line, nothing changes and no email goes out", async () => {
  const id = await submitted("Abu Dhabi", [line(), line({ description: "Second", currency: "EUR", exchangeRate: 1 })]);
  await new Promise((r) => setTimeout(r, 300));
  const before = mails;
  const res = await api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {});
  assert.equal(res.status, 400, res.message);
  assert.match(res.message, /cannot be approved until its Quantity lines are corrected\. Line 2 "Second": A rate of exactly 1 is not accepted for EUR to AED/);
  assert.doesNotMatch(res.message, /Line 1/);
  assert.equal((await row(id)).status, "Pending Accounts Approval");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(mails, before);
  // corrected and saved by the approver, it goes through
  await storeLines(id, [line(), line({ description: "Second", currency: "EUR", exchangeRate: 4.01 })]);
  assert.equal((await api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {})).status, 200);
  const done = await api(pmo, "POST", `/pr-requests/${id}/pmo-approve`, {});
  assert.equal(done.status, 200, done.message);
  const projectId = (await row(id)).createdProjectId!;
  assert.equal(await prisma.quantityItem.count({ where: { projectId } }), 2, "every line is on the Project");
});

test("PMO Manager cannot approve an old request holding an invalid line: no Project is created and the request stays pending", async () => {
  for (const bad of [line({ exchangeRate: 1 }), line({ exchangeRate: 0 }), line({ description: "" })]) {
    const id = await submitted("Abu Dhabi", [line()]);
    assert.equal((await api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {})).status, 200);
    await storeLines(id, [line(), bad]);
    const res = await api(pmo, "POST", `/pr-requests/${id}/pmo-approve`, {});
    assert.equal(res.status, 400, JSON.stringify(bad));
    const stored = await row(id);
    assert.deepEqual([stored.status, stored.createdProjectId], ["Pending PMO Manager Approval", null]);
    assert.equal(await prisma.project.count({ where: { prNo: (stored.projectData as { prNo: string }).prNo } }), 0);
    assert.equal((await api(pmo, "POST", `/pr-requests/${id}/reject`, { reason: "Wrong rate" })).status, 200, "rejecting still works");
  }
});

test("an administrator is held to the same rule at both stages and can still reject", async () => {
  const id = await submitted("Abu Dhabi", [line({ exchangeRate: 1 })]);
  const refused = await api(owner, "POST", `/pr-requests/${id}/admin/approve`, { reason: "Cover for leave" });
  assert.equal(refused.status, 400, refused.message);
  assert.match(refused.message, /Quantity lines are corrected/);
  await storeLines(id, [line()]);
  assert.equal((await api(owner, "POST", `/pr-requests/${id}/admin/approve`, { reason: "Cover for leave" })).status, 200);
  await storeLines(id, [line({ exchangeRate: 1 })]);
  assert.equal((await api(owner, "POST", `/pr-requests/${id}/admin/approve`, { reason: "Cover for leave" })).status, 400);
  assert.equal((await api(owner, "POST", `/pr-requests/${id}/admin/reject`, { reason: "Cancelled by client" })).status, 200);
});

test("valid requests are unaffected: no lines, the country's own currency, and India priced in rupees", async () => {
  for (const [category, items] of [["Abu Dhabi", []], ["Abu Dhabi", [line({ currency: "AED", exchangeRate: 1 })]], ["India", [line({ currency: "INR", exchangeRate: 1 })]]] as const) {
    const id = await submitted(category, [...items]);
    assert.equal((await api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {})).status, 200);
    const res = await api(pmo, "POST", `/pr-requests/${id}/pmo-approve`, {});
    assert.equal(res.status, 200, `${category}: ${res.message}`);
    assert.equal(await prisma.quantityItem.count({ where: { projectId: (await row(id)).createdProjectId! } }), items.length);
  }
});
