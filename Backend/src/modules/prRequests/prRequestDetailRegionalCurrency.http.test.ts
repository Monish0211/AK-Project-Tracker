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
 * PR detail page (Nov 2026): GET /pr-requests/:id (and the administrative detail) also carry `regionalCurrency` - the currency of the request's country, looked up
 * from its PR Category, never inferred from the amounts - so the page can tell a same-currency request from a converted one. Additive: every existing field is
 * unchanged, and opening a request changes nothing. Emails are captured, never sent.
 */

const TAG = `prdetail-${Date.now()}`;
let url = "";
let closeApp: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], requests: [] as string[] };

interface Actor { id: string; email: string; h: Record<string, string> }
async function makeUser(key: string, roleName: string, modules: string[]): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const email = `${TAG}-${key}@example.com`;
  const user = await prisma.portalUser.create({
    data: { fullName: `PrDetail ${key}`, email, passwordHash: await hashPassword("PrDetailTest@123"), department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) } },
  });
  created.users.push(user.id);
  return { id: user.id, email, h: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: user.id, email, roleId: role.id, roleName })}` } };
}
const api = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: actor.h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message ?? "" };
};

let requester: Actor, accounts: Actor, pmo: Actor, owner: Actor, stranger: Actor;
let seq = 0;
const data = (prCategory: string) => {
  const prNo = `PRD-${TAG}-${++seq}`;
  return { poMonth: "2026-11", prCategory, prNo, rfqNo: `RFQ-${prNo}`, client: "Detail Client", department: "PMO", domesticForeign: "Foreign", projectTitle: `Detail ${prNo}`, workOrderStatus: "Received", projectStartDate: "2026-11-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-11-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725, quantityItems: [{ description: "Study", woQty: 2, uom: "DAY", currency: "USD", unitRate: 100, exchangeRate: 3.6725 }] };
};
async function submitted(prCategory: string): Promise<string> {
  const draft = await api(requester, "POST", "/pr-requests", { projectData: data(prCategory) });
  assert.equal(draft.status, 201, draft.message);
  created.requests.push(draft.data.id);
  assert.equal((await api(requester, "POST", `/pr-requests/${draft.data.id}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id })).status, 200);
  return draft.data.id as string;
}

before(async () => {
  setEmailTransportForTests({ sendMail: async () => ({}) } as never);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeApp = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  requester = await makeUser("requester", "PR Request User", ["Approvals", "PR Request"]);
  accounts = await makeUser("accounts", "Accounts", ["Approvals"]);
  pmo = await makeUser("pmo", "PMO Manager", ["Approvals", "Projects"]);
  owner = await makeUser("owner", "Administrator", ["Approvals", "Projects"]);
  stranger = await makeUser("stranger", "Accounts", ["Approvals"]);
  process.env["ADMIN_CONTROLS_OWNER_EMAILS"] = owner.email;
});

after(async () => {
  setEmailTransportForTests(null);
  delete process.env["ADMIN_CONTROLS_OWNER_EMAILS"];
  try {
    await prisma.pRRequest.deleteMany({ where: { id: { in: created.requests } } });
    await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeApp();
  }
});

test("the detail carries the currency of the request's country: India INR, Abu Dhabi AED, Oman OMR (found from the PR Category, not from the amounts)", async () => {
  // every request below is priced in USD, so a currency inferred from the amounts would be USD for all of them
  for (const [category, expected] of [["India", "INR"], ["Abu Dhabi", "AED"], ["Oman", "OMR"]] as const) {
    const id = await submitted(category);
    const res = await api(accounts, "GET", `/pr-requests/${id}`);
    assert.equal(res.status, 200, `${category}: ${res.message}`);
    assert.equal(res.data.regionalCurrency, expected, category);
    assert.equal(res.data.projectData.quantityItems[0].currency, "USD", "the saved lines are returned exactly as stored");
  }
});

test("a category with no country configured has no regional currency (the page then treats the request as INR, as the rest of the portal does)", async () => {
  const id = await submitted("Unconfigured Category For Test");
  const res = await api(accounts, "GET", `/pr-requests/${id}`);
  assert.equal(res.status, 200, res.message);
  assert.equal(res.data.regionalCurrency, null);
});

test("the field is additive: the existing detail fields are all still there", async () => {
  const id = await submitted("India");
  const res = await api(requester, "GET", `/pr-requests/${id}`);
  assert.equal(res.status, 200);
  for (const key of ["id", "status", "projectData", "requestedByUserId", "assignedAccountsApproverId", "assignedPmoManagerId", "approvalHistory"]) assert.ok(key in res.data, key);
  assert.ok(Array.isArray(res.data.approvalHistory));
});

test("the administrative detail carries it too", async () => {
  const id = await submitted("Abu Dhabi");
  const res = await api(owner, "GET", `/pr-requests/${id}/admin`);
  assert.equal(res.status, 200, res.message);
  assert.equal(res.data.regionalCurrency, "AED");
  assert.ok(Array.isArray(res.data.approvalHistory));
});

test("access is unchanged: an approver not assigned to the request is still refused, and reading never changes the request", async () => {
  const id = await submitted("Oman");
  const before = await prisma.pRRequest.findUniqueOrThrow({ where: { id } });
  assert.notEqual((await api(stranger, "GET", `/pr-requests/${id}`)).status, 200, "an unrelated user cannot read it");
  assert.equal((await api(accounts, "GET", `/pr-requests/${id}`)).status, 200);
  assert.equal((await api(pmo, "GET", `/pr-requests/${id}`)).status, 200);
  const after = await prisma.pRRequest.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([after.status, after.updatedAt.getTime(), after.createdProjectId], [before.status, before.updatedAt.getTime(), before.createdProjectId]);
});
