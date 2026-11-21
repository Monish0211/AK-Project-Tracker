import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { setEmailTransportForTests } from "../../shared/email/transporter.js";

/**
 * Administrative Controls (Nov 2026) - end to end over real HTTP, a real (scratch) database and real JWTs.
 *  A. Settings > Administrative Controls: Administrators only, never on yourself, holders must be active Administrators, everything audited.
 *  B. D6: approval rights in User Management - Administrator only, never your own, the two administrative rights never through this path, audited.
 *  C. PR Approval Administration: register, stage-by-stage approve, reject, reassign, soft delete, D2 (admin's country access at final approval).
 *  D. Invoice Administration: raise without email (no email built), administrative delete of a Raised invoice (archived, number kept), paid refused.
 * Email: a capture-only transport is installed - nothing can reach a real mailbox; the captured list proves which emails were (not) built.
 */

const TAG = `admctl-${Date.now()}`;
const sent: { to: string; subject: string }[] = [];
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const previousMode = process.env["COUNTRY_ACCESS_MODE"];

before(async () => {
  setEmailTransportForTests({ sendMail: async (m: { to?: unknown; subject?: unknown }) => { sent.push({ to: String(m.to), subject: String(m.subject) }); return {} as never; } } as never);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

after(async () => {
  setEmailTransportForTests(null);
  if (previousMode === undefined) delete process.env["COUNTRY_ACCESS_MODE"];
  else process.env["COUNTRY_ACCESS_MODE"] = previousMode;
  await closeServer();
  await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: created.projects } } });
  for (const id of created.projects) await prisma.project.delete({ where: { id } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: created.users } } });
  await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
  for (const id of created.users) await prisma.portalUser.delete({ where: { id } }).catch(() => undefined);
});

type U = { id: string; email: string; headers: Record<string, string> };

async function makeUser(label: string, roleName: string, opts: { modules?: string[]; approvals?: string[]; allCountries?: boolean; countries?: string[]; active?: boolean } = {}): Promise<U> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: opts.modules ?? [] } } });
  const approvals = await prisma.approvalType.findMany({ where: { name: { in: opts.approvals ?? [] } } });
  const regions = await prisma.region.findMany({ where: { name: { in: opts.countries ?? [] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `AdmCtl ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("AdminCtl@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      isActive: opts.active ?? true,
      allCountriesAccess: opts.allCountries ?? false,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      approvalPermissions: { create: approvals.map((a) => ({ approvalTypeId: a.id })) },
      regionAccess: { create: regions.map((r) => ({ regionId: r.id })) },
    },
  });
  created.users.push(user.id);
  const token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
  return { id: user.id, email: user.email, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

const call = async (u: U, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: u.headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};
const auditCount = (event: string, userId: string) => prisma.authAuditLog.count({ where: { event, userId } });

function projectData(prCategory: string, prNo: string) {
  return {
    poMonth: "January 2026", prCategory, prNo, client: "AdmCtl Client", department: "PMO", domesticForeign: "Foreign",
    projectTitle: `AdmCtl ${prNo}`, workOrderStatus: "Received", projectStartDate: "2026-01-01", projectStatus: "Not Started",
    workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-01-01", rfqNo: "RFQ-ADM", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Coordinator",
  };
}

test("A + B: Administrative Controls rights and User Management approval rights", async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  const adminA = await makeUser("adminA", "Administrator");
  const adminB = await makeUser("adminB", "Administrator");
  const pmo = await makeUser("pmoA", "PMO Manager");
  const engineer = await makeUser("engA", "Engineer");

  // Only an Administrator opens it.
  assert.equal((await call(pmo, "GET", "/admin-controls")).status, 403);
  const overview = await call(adminA, "GET", "/admin-controls");
  assert.equal(overview.status, 200);
  assert.deepEqual(overview.data.rights.map((r: { name: string }) => r.name), ["PR Approval Administration", "Invoice Administration"]);
  assert.ok(overview.data.administrators.some((a: { id: string; isSelf: boolean }) => a.id === adminA.id && a.isSelf));

  // Grant to another administrator: allowed, audited. Missing reason: 400.
  const put = (u: U, target: string, right: string, granted: boolean, reason = "Business continuity cover") =>
    call(u, "PUT", `/admin-controls/users/${target}/rights`, { right, granted, reason });
  assert.equal((await call(adminA, "PUT", `/admin-controls/users/${adminB.id}/rights`, { right: "PR Approval Administration", granted: true })).status, 400);
  assert.equal((await put(adminA, adminB.id, "PR Approval Administration", true)).status, 200);
  assert.equal(await auditCount("ADMIN_CONTROL_RIGHT_GRANTED", adminA.id), 1);
  assert.deepEqual((await call(adminB, "GET", "/admin-controls/me")).data.rights, ["PR Approval Administration"]);
  assert.deepEqual((await call(engineer, "GET", "/admin-controls/me")).data.rights, []);

  // Refusals: yourself, a non-administrator target, a non-administrator caller, an unknown right - each audited.
  assert.equal((await put(adminA, adminA.id, "Invoice Administration", true)).status, 403, "never on yourself");
  assert.equal((await put(adminA, engineer.id, "Invoice Administration", true)).status, 400, "holder must be an Administrator");
  assert.equal((await put(pmo, adminB.id, "Invoice Administration", true)).status, 403, "PMO Manager cannot grant");
  assert.ok((await put(adminA, adminB.id, "Delete Everything", true)).status >= 400);
  assert.ok((await auditCount("ADMIN_CONTROL_RIGHT_CHANGE_DENIED", adminA.id)) >= 3);
  assert.equal(await auditCount("ADMIN_CONTROL_RIGHT_CHANGE_DENIED", pmo.id), 1);

  // Revoke: audited, takes effect immediately.
  assert.equal((await put(adminA, adminB.id, "PR Approval Administration", false)).status, 200);
  assert.equal(await auditCount("ADMIN_CONTROL_RIGHT_REVOKED", adminA.id), 1);
  assert.deepEqual((await call(adminB, "GET", "/admin-controls/me")).data.rights, []);

  // B (D6): User Management. The two administrative rights are not offered there.
  const lookups = await call(adminA, "GET", "/users/lookups");
  if (lookups.status === 200) {
    const names = (lookups.data.approvalTypes ?? lookups.data.approvals ?? []).map((a: { name: string }) => a.name);
    assert.ok(!names.includes("PR Approval Administration") && !names.includes("Invoice Administration"), "admin rights hidden in User Management");
  }
  const raise = await prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } });
  const prAdmin = await prisma.approvalType.findUniqueOrThrow({ where: { name: "PR Approval Administration" } });
  const rightsOf = async (id: string) =>
    (await prisma.userApprovalPermission.findMany({ where: { userId: id }, include: { approvalType: true } })).map((p) => p.approvalType.name).sort();

  assert.equal((await call(pmo, "PATCH", `/users/${engineer.id}`, { approvalIds: [raise.id] })).status, 403, "PMO Manager cannot change approval rights");
  assert.deepEqual(await rightsOf(engineer.id), []);
  assert.equal((await call(adminA, "PATCH", `/users/${adminA.id}`, { approvalIds: [raise.id] })).status, 403, "never your own approval rights");
  assert.equal((await call(adminA, "PATCH", `/users/${engineer.id}`, { approvalIds: [raise.id] })).status, 200);
  assert.deepEqual(await rightsOf(engineer.id), ["Raise Invoice"]);
  assert.equal(await auditCount("APPROVAL_RIGHTS_CHANGED", adminA.id), 1);
  // An administrative right sent through User Management is refused and nothing changes.
  assert.equal((await call(adminA, "PATCH", `/users/${adminB.id}`, { approvalIds: [prAdmin.id] })).status, 403);
  assert.deepEqual(await rightsOf(adminB.id), []);
  // A PMO Manager may still edit a user's other fields (approvalIds omitted = no change to rights).
  assert.equal((await call(pmo, "PATCH", `/users/${engineer.id}`, { department: "Process" })).status, 200);
  assert.deepEqual(await rightsOf(engineer.id), ["Raise Invoice"]);
});

test("C: PR Approval Administration - register, stage-by-stage approval, reject, reassign, soft delete, D2 country check", async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  const holder = await makeUser("prHolder", "Administrator", { allCountries: true, approvals: ["PR Approval Administration"] });
  const plainAdmin = await makeUser("prPlainAdmin", "Administrator", { allCountries: true, modules: ["Approvals"] });
  const requester = await makeUser("prRequester", "PR Request User", { modules: ["PR Request", "Approvals"], allCountries: true });
  const accounts = await makeUser("prAccounts", "Accounts", { modules: ["Approvals"], countries: ["India"] });
  const pmoIndia = await makeUser("prPmoIndia", "PMO Manager", { modules: ["Approvals", "Projects"], countries: ["India"] });
  const pmoOther = await makeUser("prPmoOther", "PMO Manager", { modules: ["Approvals", "Projects"], countries: ["India"] });

  const submit = async (prCategory: string, prNo: string) => {
    const draft = await call(requester, "POST", "/pr-requests", { projectData: projectData(prCategory, prNo) });
    assert.equal(draft.status, 201, `draft ${prNo}: ${draft.message}`);
    const sent2 = await call(requester, "POST", `/pr-requests/${draft.data.id}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmoIndia.id });
    assert.equal(sent2.status, 200, `send ${prNo}: ${sent2.message}`);
    return draft.data.id as string;
  };
  const history = (id: string) => prisma.pRRequestApprovalHistory.findMany({ where: { prRequestId: id }, orderBy: { createdAt: "asc" } });
  const statusOf = async (id: string) => (await prisma.pRRequest.findUniqueOrThrow({ where: { id } })).status;
  const stamp = Date.now();

  // 1. Oman request; the assigned PMO Manager holds India only. Ordinary path: the PMO Manager's own country check refuses it (unchanged).
  const omanId = await submit("Oman", `EE-ADM-${stamp}`);
  // Only holders reach the register or any admin action - a plain Administrator without the right is refused.
  assert.equal((await call(plainAdmin, "GET", "/pr-requests/admin/all")).status, 403);
  assert.equal((await call(plainAdmin, "POST", `/pr-requests/${omanId}/admin/approve`, { reason: "No right held" })).status, 403);
  assert.equal(await statusOf(omanId), "Pending Accounts Approval");
  // Reason is mandatory.
  assert.equal((await call(holder, "POST", `/pr-requests/${omanId}/admin/approve`, {})).status, 400);

  // Register: cross-country, filters.
  const reg = await call(holder, "GET", "/pr-requests/admin/all?prCategory=Oman");
  assert.equal(reg.status, 200);
  const omanRow = reg.data.find((r: { id: string }) => r.id === omanId);
  assert.equal(omanRow?.prCategory, "Oman");
  assert.equal(omanRow?.prNo, `EE-ADM-${stamp}`);
  assert.equal(omanRow?.projectName, `AdmCtl EE-ADM-${stamp}`, "register shows the request's project title (projectData.projectTitle)");
  assert.equal(omanRow?.customerName, "AdmCtl Client", "register shows the request's client (projectData.client)");
  assert.ok(reg.data.every((r: { prCategory: string }) => r.prCategory === "Oman"));

  // 2. Admin approves at the Accounts stage only -> PMO stage (never straight to Approved).
  const a1 = await call(holder, "POST", `/pr-requests/${omanId}/admin/approve`, { reason: "Accounts approver on leave" });
  assert.equal(a1.status, 200, a1.message);
  assert.equal(await statusOf(omanId), "Pending PMO Manager Approval");
  let h = await history(omanId);
  assert.equal(h.at(-1)!.action, "AdminAccountsApproved");
  assert.equal(h.at(-1)!.actorUserId, holder.id);
  assert.equal(h.at(-1)!.onBehalfOfUserId, accounts.id);
  assert.equal(h.at(-1)!.remarks, "Accounts approver on leave");

  // The assigned India-only PMO Manager cannot create an Oman project (existing country rule, unchanged).
  const ordinary = await call(pmoIndia, "POST", `/pr-requests/${omanId}/pmo-approve`, {});
  assert.equal(ordinary.status, 403, `ordinary PMO approval in a country the manager lacks: ${ordinary.message}`);
  assert.equal(await statusOf(omanId), "Pending PMO Manager Approval", "a refused approval leaves the request pending");

  // 3. Reassign the PMO Manager (PMO stage); Accounts approver can no longer be changed at this stage.
  assert.equal((await call(holder, "POST", `/pr-requests/${omanId}/admin/reassign`, { assignedAccountsApproverId: pmoOther.id, reason: "Wrong stage change" })).status, 409);
  const re = await call(holder, "POST", `/pr-requests/${omanId}/admin/reassign`, { assignedPmoManagerId: pmoOther.id, reason: "Original manager unavailable" });
  assert.equal(re.status, 200, re.message);
  assert.equal(re.data.assignedPmoManagerId, pmoOther.id);
  h = await history(omanId);
  assert.equal(h.at(-1)!.action, "Reassigned");
  assert.match(h.at(-1)!.remarks ?? "", /PMO Manager: .* -> AdmCtl prPmoOther/);

  // 4. D2: final admin approval uses the ADMIN's country access; the project is owned by the assigned PMO Manager.
  const fin = await call(holder, "POST", `/pr-requests/${omanId}/admin/approve`, { reason: "Completing stranded Oman request" });
  assert.equal(fin.status, 200, fin.message);
  assert.equal(fin.data.status, "Approved");
  const project = await prisma.project.findUniqueOrThrow({ where: { id: fin.data.createdProjectId }, include: { region: true } });
  created.projects.push(project.id);
  assert.equal(project.createdByUserId, pmoOther.id, "owner = the assigned PMO Manager");
  assert.equal(project.region?.name, "Oman");
  h = await history(omanId);
  assert.equal(h.at(-1)!.action, "AdminPmoManagerApproved");
  assert.equal(h.at(-1)!.onBehalfOfUserId, pmoOther.id);
  // Approved: cannot be approved again, rejected, reassigned or deleted.
  assert.equal((await call(holder, "POST", `/pr-requests/${omanId}/admin/approve`, { reason: "Second approval" })).status, 409);
  assert.equal((await call(holder, "POST", `/pr-requests/${omanId}/admin/delete`, { reason: "Try delete approved" })).status, 409);
  assert.equal(await prisma.project.count({ where: { prNo: `EE-ADM-${stamp}` } }), 1, "exactly one project");

  // 5. Reject at the Accounts stage on behalf of the Accounts approver; the requester is notified as usual.
  const rejId = await submit("India", `PR-ADM-R-${stamp}`);
  const rj = await call(holder, "POST", `/pr-requests/${rejId}/admin/reject`, { reason: "Duplicate of another request" });
  assert.equal(rj.status, 200, rj.message);
  assert.equal(await statusOf(rejId), "Rejected");
  h = await history(rejId);
  assert.equal(h.at(-1)!.action, "AdminRejected");
  assert.equal(h.at(-1)!.onBehalfOfUserId, accounts.id);
  assert.equal(await prisma.notification.count({ where: { userId: requester.id, type: "PR_REQUEST_REJECTED", entityId: rejId } }), 1);

  // 6. Soft delete (Rejected allowed): kept with who/when/why, hidden from the requester, still in the admin register.
  const del = await call(holder, "POST", `/pr-requests/${rejId}/admin/delete`, { reason: "Clean-up of duplicate" });
  assert.equal(del.status, 200, del.message);
  const row = await prisma.pRRequest.findUniqueOrThrow({ where: { id: rejId } });
  assert.equal(row.status, "Deleted");
  assert.equal(row.deletedByUserId, holder.id);
  assert.equal(row.deleteReason, "Clean-up of duplicate");
  assert.ok(row.deletedAt);
  const mine = await call(requester, "GET", "/pr-requests/mine");
  assert.ok(!mine.data.some((r: { id: string }) => r.id === rejId), "hidden from the requester's list");
  assert.equal((await call(requester, "GET", `/pr-requests/${rejId}`)).status, 404, "hidden from the requester's detail");
  const adminView = await call(holder, "GET", `/pr-requests/${rejId}/admin`);
  assert.equal(adminView.status, 200, "a holder can still open it");
  assert.equal(adminView.data.deleteReason, "Clean-up of duplicate");
  assert.equal(adminView.data.approvalHistory.at(-1).action, "AdminDeleted");
  assert.equal((await call(plainAdmin, "GET", `/pr-requests/${rejId}/admin`)).status, 403);
  assert.ok((await call(holder, "GET", "/pr-requests/admin/all?status=Deleted")).data.some((r: { id: string }) => r.id === rejId));
  // The requester's own Draft delete / edit paths cannot touch a deleted request.
  assert.equal((await call(requester, "DELETE", `/pr-requests/${rejId}`)).status, 409);

  // 7. Admin edit of a pending request: same validation; logged as AdminEdited only when data changed.
  const editId = await submit("India", `PR-ADM-E-${stamp}`);
  const bad = await call(holder, "PUT", `/pr-requests/${editId}/admin/data`, { projectData: { ...projectData("India", `PR-ADM-E-${stamp}`), prNo: "" }, reason: "Fix PR" });
  assert.equal(bad.status, 400, "same validation as the form");
  const same = await call(holder, "PUT", `/pr-requests/${editId}/admin/data`, { projectData: projectData("India", `PR-ADM-E-${stamp}`), reason: "No-op save" });
  assert.equal(same.status, 200);
  assert.equal((await history(editId)).filter((x) => x.action === "AdminEdited").length, 0, "no entry when nothing changed");
  const changed = await call(holder, "PUT", `/pr-requests/${editId}/admin/data`, {
    projectData: { ...projectData("India", `PR-ADM-E-${stamp}`), client: "Corrected Client" },
    reason: "Client name corrected",
  });
  assert.equal(changed.status, 200, changed.message);
  h = await history(editId);
  assert.equal(h.at(-1)!.action, "AdminEdited");
  assert.equal(h.at(-1)!.onBehalfOfUserId, accounts.id);
  // Ordinary approvers are unaffected.
  assert.equal((await call(accounts, "POST", `/pr-requests/${editId}/accounts-approve`, {})).status, 200);
  assert.equal(await statusOf(editId), "Pending PMO Manager Approval");
  // Every admin action is in the security audit log.
  for (const e of ["PR_REQUEST_ADMIN_APPROVED", "PR_REQUEST_ADMIN_REJECTED", "PR_REQUEST_ADMIN_REASSIGNED", "PR_REQUEST_ADMIN_DELETED", "PR_REQUEST_ADMIN_EDITED"]) {
    assert.ok((await auditCount(e, holder.id)) >= 1, `${e} audited`);
  }
});

test("D: Invoice Administration - raise without email, administrative delete with archive, number kept, paid refused", async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  const both = ["Projects", "Invoices"];
  const holder = await makeUser("invHolder", "Administrator", { modules: both, approvals: ["Raise Invoice", "Edit Invoice", "Delete Invoice", "Invoice Administration"] });
  const deleter = await makeUser("invDeleter", "Engineer", { modules: both, approvals: ["Raise Invoice", "Edit Invoice", "Delete Invoice"] });
  const requester = await makeUser("invRequester", "Engineer", { modules: both });

  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-PR`, client: "AdmCtl Client", department: "Process", domesticForeign: "Domestic",
      projectTitle: "Invoice administration", workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
      contractType: "LUMP SUM", createdByUserId: null,
    },
  });
  created.projects.push(project.id);
  const item = await prisma.quantityItem.create({
    data: { projectId: project.id, description: "Item 1", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 },
  });
  const raise = (u: U, invoiceNo: string, extra: Record<string, unknown> = {}) =>
    call(u, "POST", `/quantity/${item.id}/invoice-lines`, { invoiceNo, invoiceIntent: "new", invoiceDate: "2026-03-01", quantityBilled: 0, invoiceAmountINR: 1000, status: "Raised", ...extra });
  const openRequest = () =>
    prisma.invoiceRequest.create({ data: { projectId: project.id, requestedByUserId: requester.id, assignedToUserId: holder.id, status: "Open" } });
  const waitFulfilled = async (id: string) => {
    for (let i = 0; i < 50; i++) {
      const r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id } });
      if (r.status !== "Open") return r;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("invoice request was never fulfilled");
  };

  // Raise without email: refused for a non-holder (nothing written), accepted for a holder.
  assert.equal((await raise(deleter, `${TAG}-X`, { suppressEmail: true })).status, 403);
  assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: `${TAG}-X` } }), 0);
  const req1 = await openRequest();
  sent.length = 0;
  const quiet = await raise(holder, `${TAG}-Q`, { suppressEmail: true });
  assert.equal(quiet.status, 201, quiet.message);
  const fulfilled = await waitFulfilled(req1.id);
  assert.equal(fulfilled.fulfilledInvoiceLineId, quiet.data.id, "request fulfilled exactly as usual");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(!sent.some((m) => /raised/i.test(m.subject)), "no 'Invoice Raised Successfully' email was built");
  assert.equal(await prisma.notification.count({ where: { userId: requester.id, type: "INVOICE_REQUEST_FULFILLED" } }), 1, "in-app notification kept");
  assert.equal(await auditCount("INVOICE_RAISED_WITHOUT_EMAIL", holder.id), 1);

  // Normal raise still emails.
  const req2 = await openRequest();
  sent.length = 0;
  const loud = await raise(holder, `${TAG}-N`);
  assert.equal(loud.status, 201);
  await waitFulfilled(req2.id);
  for (let i = 0; i < 30 && !sent.some((m) => /raised/i.test(m.subject)); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(sent.some((m) => /raised/i.test(m.subject)), "the ordinary raise still sends its email");

  // Administrative delete of a Raised invoice.
  const line = loud.data as { id: string; invoiceNo: string };
  const del = (u: U, id: string, body?: unknown) => call(u, "DELETE", `/invoice-lines/${id}`, body);
  assert.equal((await del(deleter, line.id)).status, 403, "Delete Invoice alone no longer deletes a Raised invoice (D3)");
  assert.equal((await del(holder, line.id)).status, 400, "reason required");
  assert.equal((await del(holder, line.id, { reason: "x" })).status, 400, "reason too short");
  const gone = await del(holder, line.id, { reason: "Raised against the wrong project" });
  assert.equal(gone.status, 200, gone.message);
  assert.equal(await prisma.invoiceLine.count({ where: { id: line.id } }), 0);
  const archive = await prisma.invoiceLineDeletion.findFirstOrThrow({ where: { originalLineId: line.id } });
  assert.equal(archive.invoiceNo, line.invoiceNo);
  assert.equal(archive.status, "Raised");
  assert.equal(archive.reason, "Raised against the wrong project");
  assert.equal(archive.actorUserId, holder.id);
  assert.equal((archive.originalRow as { invoiceAmountINR: number }).invoiceAmountINR, 1000, "full original row kept");
  assert.equal(await prisma.invoiceNumber.count({ where: { projectId: project.id, invoiceNo: line.invoiceNo } }), 1, "number stays reserved (D4)");
  assert.equal(await auditCount("INVOICE_ADMIN_DELETED", holder.id), 1);
  // The archive is append-only.
  await assert.rejects(prisma.invoiceLineDeletion.update({ where: { id: archive.id }, data: { reason: "changed" } }));
  await assert.rejects(prisma.invoiceLineDeletion.delete({ where: { id: archive.id } }));
  // A raise reusing the reserved number for a NEW invoice is still refused (it belongs to the deleted invoice).
  const reuse = await raise(holder, line.invoiceNo);
  assert.ok(reuse.status >= 400, "a deleted invoice's number is not handed out again");

  // Draft delete: unchanged - Delete Invoice right, no reason, number released.
  const draft = await raise(deleter, `${TAG}-D`, { status: "Draft" });
  assert.equal(draft.status, 201);
  assert.equal((await del(deleter, draft.data.id)).status, 200);
  assert.equal(await prisma.invoiceNumber.count({ where: { projectId: project.id, invoiceNo: `${TAG}-D` } }), 0, "draft number released as before");
  assert.equal(await prisma.invoiceLineDeletion.count({ where: { originalLineId: draft.data.id } }), 0, "drafts are not archived");

  // Paid: refused for everyone, holder included.
  await prisma.invoiceLine.update({ where: { id: quiet.data.id }, data: { status: "Paid" } });
  assert.equal((await del(holder, quiet.data.id, { reason: "Trying to delete a paid invoice" })).status, 409);
  assert.equal(await prisma.invoiceLine.count({ where: { id: quiet.data.id } }), 1);
});

test("E: a named owner (ADMIN_CONTROLS_OWNER_EMAILS) - only the owner grants or revokes; everyone else read-only and refused", async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  const owner = await makeUser("ownerA", "Administrator");
  const other = await makeUser("ownerB", "Administrator");
  const target = await makeUser("ownerC", "Administrator");
  const put = (u: U, targetId: string, granted: boolean) =>
    call(u, "PUT", `/admin-controls/users/${targetId}/rights`, { right: "Invoice Administration", granted, reason: "Owner rule test" });
  process.env["ADMIN_CONTROLS_OWNER_EMAILS"] = ` ${owner.email.toUpperCase()} , backup-nobody@example.com`;
  try {
    // Another Administrator: sees the page read-only, and the API refuses (audited as NOT_OWNER).
    const view = await call(other, "GET", "/admin-controls");
    assert.equal(view.status, 200);
    assert.equal(view.data.canManage, false);
    assert.equal(view.data.owners[0].email, owner.email.toLowerCase());
    assert.equal((await put(other, target.id, true)).status, 403);
    const denied = await prisma.authAuditLog.findFirst({ where: { userId: other.id, event: "ADMIN_CONTROL_RIGHT_CHANGE_DENIED" }, orderBy: { createdAt: "desc" } });
    assert.equal((denied?.details as { refusal?: string } | null)?.refusal, "NOT_OWNER");
    assert.equal(await prisma.userApprovalPermission.count({ where: { userId: target.id } }), 0, "nothing granted");
    // The owner: may grant and revoke for others (matching ignores case and spaces) - but still never for themselves.
    assert.equal((await call(owner, "GET", "/admin-controls")).data.canManage, true);
    // The owner holds BOTH rights automatically (no grant) and can use them; nobody can grant or revoke the owner's rights.
    assert.deepEqual((await call(owner, "GET", "/admin-controls/me")).data.rights, ["PR Approval Administration", "Invoice Administration"]);
    assert.equal((await call(owner, "GET", "/pr-requests/admin/all")).status, 200);
    assert.equal(await prisma.userApprovalPermission.count({ where: { userId: owner.id } }), 0, "no grant row needed");
    assert.equal((await put(other, owner.id, false)).status, 403, "a non-owner cannot touch the owner");
    assert.deepEqual((await call(other, "GET", "/admin-controls/me")).data.rights, [], "the other Administrator holds nothing until granted");
    assert.equal((await call(other, "GET", "/pr-requests/admin/all")).status, 403);
    assert.equal((await put(owner, target.id, true)).status, 200);
    assert.equal((await put(owner, target.id, false)).status, 200);
    assert.equal((await put(owner, owner.id, true)).status, 403, "the owner cannot grant themselves");
  } finally {
    delete process.env["ADMIN_CONTROLS_OWNER_EMAILS"];
  }
  // Without the setting the owner is an ordinary Administrator again: no automatic rights.
  assert.deepEqual((await call(owner, "GET", "/admin-controls/me")).data.rights, []);
  // No owner configured: the original rule (any Administrator manages the others).
  assert.equal((await call(other, "GET", "/admin-controls")).data.canManage, true);
  assert.equal((await put(other, target.id, true)).status, 200);
});
