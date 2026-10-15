import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Edit / Delete approval rights (Oct 2026). Both rights are
 * independent; enforced on the backend (PATCH content edits need "Edit
 * Invoice", DELETE needs "Delete Invoice"); status-only changes keep their own
 * rules; neither right grants Invoices module access or invoice viewing.
 * Isolated, tagged data cleaned up in `finally`. Only Draft lines and a
 * Draft -> Cancelled status change are used, so no invoice email path
 * (Raised / Paid / Request) can ever be reached.
 */

const TAG = `invapr-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

interface LineDto {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  quantityBilled: number;
  invoiceAmountINR: number;
  status: string;
  remarks: string | null;
}

test("Invoice Edit / Delete approval rights — independent, backend-enforced, no access escalation, persisted", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineer, readOnlyRole, adminRole, invoicesModule, projectsModule, raise, edit, del] = await Promise.all([
      prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findFirstOrThrow({ where: { name: "Read Only" } }),
      prisma.portalRole.findFirstOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvApproval@123");
    const makeUser = async (label: string, opts: { role?: { id: string; name: string }; modules: string[]; approvals: string[] }) => {
      const role = opts.role ?? engineer;
      const user = await prisma.portalUser.create({
        data: {
          fullName: `InvApr ${label}`,
          email: `${TAG}-${label}@example.com`,
          passwordHash,
          department: "Accounts",
          roleId: role.id,
          forcePasswordChange: false,
          moduleAccess: { create: opts.modules.map((moduleId) => ({ moduleId })) },
          approvalPermissions: { create: opts.approvals.map((approvalTypeId) => ({ approvalTypeId })) },
        },
      });
      createdUserIds.push(user.id);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name })}`,
      };
      return { user, headers };
    };
    const both = [projectsModule.id, invoicesModule.id];
    const creator = await makeUser("creator", { modules: both, approvals: [raise.id] });
    const none = await makeUser("none", { modules: both, approvals: [raise.id] });
    const editor = await makeUser("editor", { modules: both, approvals: [edit.id] });
    const deleter = await makeUser("deleter", { modules: both, approvals: [del.id] });
    const noModule = await makeUser("nomodule", { modules: [projectsModule.id], approvals: [edit.id, del.id] });
    const readOnly = await makeUser("readonly", { role: readOnlyRole, modules: both, approvals: [edit.id, del.id] });
    const admin = await makeUser("admin", { role: adminRole, modules: [], approvals: [] });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-PR`, client: "InvApr Client", department: "Process",
        domesticForeign: "Domestic", projectTitle: "Invoice approval rights", workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null,
      },
    });
    createdProjectIds.push(project.id);
    const item = await prisma.quantityItem.create({
      data: { projectId: project.id, description: "Item 1", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 },
    });

    const createDraft = async (suffix: string) => {
      const res = await fetch(`${url}/quantity/${item.id}/invoice-lines`, {
        method: "POST", headers: creator.headers,
        body: JSON.stringify({ invoiceNo: `${TAG}-${suffix}`, invoiceIntent: "new", invoiceDate: "2026-03-01", quantityBilled: 0, invoiceAmountINR: 1000, status: "Draft" }),
      });
      assert.equal(res.status, 201, `create ${suffix}`);
      return ((await res.json()) as { data: LineDto }).data;
    };
    // The exact full payload the frontend re-sends on every PATCH (toInvoiceLinePayload()).
    const resend = (line: LineDto, overrides: Record<string, unknown> = {}) => ({
      invoiceNo: line.invoiceNo, invoiceDate: line.invoiceDate.slice(0, 10), milestoneId: null, milestoneName: null,
      setIndex: null, description: null, quantityBilled: line.quantityBilled, invoiceAmountINR: line.invoiceAmountINR,
      clientReference: null, remarks: line.remarks ?? null, status: line.status, createdBy: "x", ...overrides,
    });
    const patch = (h: Record<string, string>, id: string, body: unknown) =>
      fetch(`${url}/invoice-lines/${id}`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
    const del_ = (h: Record<string, string>, id: string) => fetch(`${url}/invoice-lines/${id}`, { method: "DELETE", headers: h });
    const stored = (id: string) => prisma.invoiceLine.findUnique({ where: { id } });

    const L1 = await createDraft("L1");
    const L2 = await createDraft("L2");
    const L3 = await createDraft("L3");
    const L4 = await createDraft("L4");

    // ---- A. Edit Invoice disabled: content edits rejected, nothing written ----
    assert.equal((await patch(none.headers, L1.id, resend(L1, { remarks: "edited" }))).status, 403, "no Edit Invoice -> remarks edit 403");
    assert.equal((await patch(none.headers, L1.id, resend(L1, { invoiceAmountINR: 2000 }))).status, 403, "no Edit Invoice -> amount edit 403");
    assert.equal((await patch(none.headers, L1.id, resend(L1, { invoiceDate: "2026-03-05" }))).status, 403, "no Edit Invoice -> date edit 403");
    assert.equal((await patch(none.headers, L1.id, { remarks: "direct partial" })).status, 403, "direct partial API edit 403");
    const afterDenied = await stored(L1.id);
    assert.equal(afterDenied?.remarks ?? null, null);
    assert.equal(afterDenied?.invoiceAmountINR, 1000);
    // Status-only changes keep their own rules (confirmed): unchanged re-send and Draft -> Cancelled still work.
    assert.equal((await patch(none.headers, L1.id, resend(L1))).status, 200, "unchanged re-send is not an edit");
    assert.equal((await patch(none.headers, L4.id, resend(L4, { status: "Cancelled" }))).status, 200, "status-only change needs no Edit Invoice");
    assert.equal((await stored(L4.id))?.status, "Cancelled");
    // Delete disabled for this user too.
    assert.equal((await del_(none.headers, L2.id)).status, 403, "no Delete Invoice -> delete 403");
    assert.ok(await stored(L2.id), "line still exists");

    // ---- B. Edit Invoice enabled (independent of Delete) ----
    assert.equal((await patch(editor.headers, L1.id, resend(L1, { remarks: "edited by editor" }))).status, 200);
    assert.equal((await stored(L1.id))?.remarks, "edited by editor");
    assert.equal((await patch(editor.headers, L1.id, resend(L1, { remarks: "edited by editor", invoiceAmountINR: 1500 }))).status, 200);
    assert.equal((await stored(L1.id))?.invoiceAmountINR, 1500);
    assert.equal((await del_(editor.headers, L2.id)).status, 403, "Edit Invoice does not grant delete");
    assert.ok(await stored(L2.id));

    // ---- C. Delete Invoice enabled (independent of Edit) ----
    assert.equal((await patch(deleter.headers, L2.id, resend(L2, { remarks: "nope" }))).status, 403, "Delete Invoice does not grant edit");
    assert.equal((await del_(deleter.headers, L3.id)).status, 200);
    assert.equal(await stored(L3.id), null, "deleted");

    // ---- D. No access escalation ----
    assert.equal((await patch(noModule.headers, L2.id, resend(L2, { remarks: "x" }))).status, 403, "no Invoices module -> edit 403");
    assert.equal((await del_(noModule.headers, L2.id)).status, 403, "no Invoices module -> delete 403");
    assert.equal((await fetch(`${url}/projects/${project.id}/invoice-items`, { headers: noModule.headers })).status, 403, "rights do not grant viewing");
    assert.equal((await patch(readOnly.headers, L2.id, resend(L2, { remarks: "x" }))).status, 403, "Read Only role still blocked");
    assert.equal((await del_(readOnly.headers, L2.id)).status, 403, "Read Only role still blocked");
    assert.ok(await stored(L2.id));

    // ---- E. Viewing / history unaffected for a user with neither right ----
    const viewRes = await fetch(`${url}/projects/${project.id}/invoice-items`, { headers: none.headers });
    assert.equal(viewRes.status, 200);
    const viewed = (await viewRes.json()) as { data: { items: Array<{ invoices: LineDto[] }> } };
    assert.equal(viewed.data.items.flatMap((i) => i.invoices).length, 3, "L1, L2, L4 visible (L3 deleted)");

    // ---- F. Persistence through Settings > User Management, effective immediately ----
    const lookups = (await (await fetch(`${url}/users/lookups`, { headers: admin.headers })).json()) as { data: { approvalTypes: Array<{ id: string; name: string }> } };
    const names = lookups.data.approvalTypes.map((a) => a.name);
    assert.ok(names.includes("Edit Invoice") && names.includes("Delete Invoice"), "both rights offered in the user form");
    const save = (approvalIds: string[]) =>
      fetch(`${url}/users/${none.user.id}`, { method: "PATCH", headers: admin.headers, body: JSON.stringify({ approvalIds }) });
    assert.equal((await save([raise.id, edit.id])).status, 200, "admin saves Edit Invoice for the user");
    const me = (await (await fetch(`${url}/auth/me`, { headers: none.headers })).json()) as { data: { approvals: string[] } };
    assert.ok(me.data.approvals.includes("Edit Invoice") && !me.data.approvals.includes("Delete Invoice"), "reloaded rights reflect the save");
    assert.equal((await patch(none.headers, L2.id, resend(L2, { remarks: "now allowed" }))).status, 200, "grant effective immediately");
    assert.equal((await del_(none.headers, L2.id)).status, 403, "still no delete");
    assert.equal((await save([raise.id])).status, 200, "admin removes Edit Invoice");
    const me2 = (await (await fetch(`${url}/auth/me`, { headers: none.headers })).json()) as { data: { approvals: string[] } };
    assert.ok(!me2.data.approvals.includes("Edit Invoice"));
    assert.equal((await patch(none.headers, L2.id, resend(L2, { remarks: "blocked again" }))).status, 403, "revoke effective immediately");
    assert.equal((await stored(L2.id))?.remarks, "now allowed");
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
