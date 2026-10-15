import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * "View All Projects" approval right (Oct 2026) — PMO-Manager-equivalent
 * project access (view AND edit every project) for users explicitly granted
 * it; Administrator/PMO Manager unchanged; Project Manager sharing
 * (ProjectManagerScope) unchanged; does NOT grant archive, permanent delete or
 * invoice raise/edit/delete; never bypasses module access or Read Only.
 * Isolated, tagged data cleaned up in `finally`. No email-capable action
 * (no invoice raise/pay/request/send) is used.
 */

const TAG = `viewall-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

interface ListDto { items: Array<{ id: string; prNo: string }>; total: number; page: number; pageSize: number }

test("View All Projects — view + edit every project; archive/delete/invoice rights, PM sharing, PMO/Admin, module and Read Only unchanged", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const role = async (name: string) => prisma.portalRole.findFirstOrThrow({ where: { name } });
    const [admin, pmo, pm, accounts, engineer, readOnly] = await Promise.all(
      ["Administrator", "PMO Manager", "Project Manager", "Accounts", "Engineer", "Read Only"].map(role)
    );
    const mod = async (name: string) => (await prisma.module.findFirstOrThrow({ where: { name } })).id;
    const [PROJECTS, DASHBOARD, INVOICES] = await Promise.all(["Projects", "Dashboard", "Invoices"].map(mod));
    const appr = async (name: string) => (await prisma.approvalType.findFirstOrThrow({ where: { name } })).id;
    const [VIEW_ALL, EDIT_INV, DEL_INV, RAISE] = await Promise.all(["View All Projects", "Edit Invoice", "Delete Invoice", "Raise Invoice"].map(appr));
    const passwordHash = await hashPassword("ViewAll@12345");

    const makeUser = async (label: string, r: { id: string; name: string }, modules: string[], approvals: string[] = []) => {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `ViewAll ${label}`, email: `${TAG}-${label}@example.com`, passwordHash, department: "Accounts",
          roleId: r.id, forcePasswordChange: false,
          moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
          approvalPermissions: { create: approvals.map((approvalTypeId) => ({ approvalTypeId })) },
        },
      });
      createdUserIds.push(user.id);
      return {
        user,
        h: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: user.id, email: user.email, roleId: r.id, roleName: r.name })}` },
      };
    };
    const ALL3 = [PROJECTS, DASHBOARD, INVOICES];
    const ownerX = await makeUser("ownerx", engineer, ALL3, [RAISE]);
    const ownerY = await makeUser("ownery", engineer, ALL3);
    const adminU = await makeUser("admin", admin, ALL3);
    const pmoU = await makeUser("pmo", pmo, ALL3);
    const pmU = await makeUser("pm", pm, ALL3);
    const acctView = await makeUser("acctview", accounts, ALL3, [VIEW_ALL]); // no Archive/Delete/Raise/Edit/Delete-Invoice rights
    const acctPlain = await makeUser("acctplain", accounts, ALL3, [EDIT_INV, DEL_INV]);
    const acctNoProjects = await makeUser("acctnoproj", accounts, [DASHBOARD, INVOICES], [VIEW_ALL]);
    const roView = await makeUser("roview", readOnly, ALL3, [VIEW_ALL]);
    // Existing Project Manager sharing: pm may see ownerX's projects (only).
    await prisma.projectManagerScope.create({ data: { projectManagerId: pmU.user.id, grantedUserId: ownerX.user.id } });

    const makeProject = async (suffix: string, createdByUserId: string) => {
      const p = await prisma.project.create({
        data: {
          poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${suffix}`, client: "ViewAll Client", department: "Process",
          domesticForeign: "Domestic", projectTitle: `ViewAll ${suffix}`, workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId,
        },
      });
      createdProjectIds.push(p.id);
      return p;
    };
    const PX = await makeProject("PX", ownerX.user.id);
    const PY = await makeProject("PY", ownerY.user.id);
    const PA = await makeProject("PA", acctPlain.user.id);
    const qx = await prisma.quantityItem.create({
      data: { projectId: PX.id, description: "Item X", woQty: 10, uom: "DAY", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10_000 },
    });
    const lineX = await prisma.invoiceLine.create({
      data: { quantityItemId: qx.id, invoiceNo: `${TAG}-INV-X`, invoiceDate: new Date("2026-03-01"), quantityBilled: 0, invoiceAmountINR: 500, status: "Draft", createdBy: "fixture" },
    });

    const get = (h: Record<string, string>, path: string) => fetch(`${url}${path}`, { headers: h });
    const listTagged = async (h: Record<string, string>, extra = "", pageSize = 50) => {
      const res = await get(h, `/projects?search=${encodeURIComponent(TAG)}&pageSize=${pageSize}${extra}`);
      assert.equal(res.status, 200);
      return ((await res.json()) as { data: ListDto }).data;
    };
    const prNos = (d: ListDto) => d.items.map((i) => i.prNo.replace(`${TAG}-`, "")).sort();
    const statusTotal = async (h: Record<string, string>) => {
      const body = (await (await get(h, "/projects/status-counts")).json()) as { data: Record<string, number> };
      return Object.values(body.data).reduce((s, n) => s + (typeof n === "number" ? n : 0), 0);
    };
    const dashTotal = async (h: Record<string, string>) => {
      const res = await get(h, "/dashboard/summary");
      assert.equal(res.status, 200);
      const n = ((await res.json()) as { data: { kpis: { totalProjects: number } } }).data.kpis.totalProjects;
      assert.equal(typeof n, "number", "dashboard totalProjects present");
      return n;
    };
    // Global totals can move while the suite's other test files create/delete
    // their own projects concurrently. Compare the user's total against the
    // Administrator's only when the Administrator's total was identical
    // immediately before AND after reading the user's (retry otherwise).
    const assertSameAsAdminWhenStable = async (read: (h: Record<string, string>) => Promise<number>, h: Record<string, string>, label: string) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const before = await read(adminU.h);
        const mine = await read(h);
        const after = await read(adminU.h);
        if (before === after) {
          assert.equal(mine, before, label);
          return;
        }
      }
      assert.fail(`${label}: Administrator total never stable across 5 attempts`);
    };

    // 1-2. Administrator and PMO Manager see everything, by role, without the new right.
    assert.deepEqual(prNos(await listTagged(adminU.h)), ["PA", "PX", "PY"]);
    assert.deepEqual(prNos(await listTagged(pmoU.h)), ["PA", "PX", "PY"]);

    // 3-4. Project Manager: own + explicitly shared (ownerX) only — never all projects.
    assert.deepEqual(prNos(await listTagged(pmU.h)), ["PX"], "PM sees shared PX, not PY/PA");
    assert.equal((await get(pmU.h, `/projects/${PY.id}`)).status, 403, "PM cannot open an unshared project");

    // 5. Accounts WITH View All Projects: every project, incl. other users' — list, detail, children.
    assert.deepEqual(prNos(await listTagged(acctView.h)), ["PA", "PX", "PY"]);
    for (const p of [PX, PY]) {
      assert.equal((await get(acctView.h, `/projects/${p.id}`)).status, 200, `detail ${p.prNo}`);
      for (const child of ["quantity", "milestones", "expenses", "resources", "notes", "documents", "invoice-items", "invoice-requests"]) {
        assert.equal((await get(acctView.h, `/projects/${p.id}/${child}`)).status, 200, `${p.prNo} ${child}`);
      }
    }
    const xInvoices = (await (await get(acctView.h, `/projects/${PX.id}/invoice-items`)).json()) as { data: { items: Array<{ invoices: Array<{ id: string }> }> } };
    assert.ok(xInvoices.data.items.flatMap((i) => i.invoices).some((l) => l.id === lineX.id), "invoice history of another user's project is visible");

    // 6. Accounts WITHOUT the right: unchanged ownership rule.
    assert.deepEqual(prNos(await listTagged(acctPlain.h)), ["PA"]);
    for (const p of [PX, PY]) {
      assert.equal((await get(acctPlain.h, `/projects/${p.id}`)).status, 403);
      assert.equal((await get(acctPlain.h, `/projects/${p.id}/quantity`)).status, 403);
      assert.equal((await get(acctPlain.h, `/projects/${p.id}/invoice-items`)).status, 403);
    }

    // 11. Search, filter, pagination, counts and dashboard use the same scope.
    const page1 = await listTagged(acctView.h, "&page=1", 1);
    assert.equal(page1.total, 3, "pagination total counts all visible projects");
    assert.equal(page1.items.length, 1);
    assert.deepEqual(prNos(await listTagged(acctView.h, "&projectStatus=Active")), ["PA", "PX", "PY"], "filter keeps the scope");
    assert.equal((await listTagged(acctPlain.h, "&page=1", 1)).total, 1);
    await assertSameAsAdminWhenStable(statusTotal, acctView.h, "status counts = all projects");
    assert.ok((await statusTotal(acctPlain.h)) < (await statusTotal(acctView.h)), "plain user's counts stay restricted");
    await assertSameAsAdminWhenStable(dashTotal, acctView.h, "dashboard = all projects");
    assert.ok((await dashTotal(acctPlain.h)) < (await dashTotal(acctView.h)), "plain user's dashboard stays restricted");
    const lines = (await (await get(acctView.h, "/invoice-items")).json()) as { data: { items: Array<{ id: string }> } };
    assert.ok(lines.data.items.some((l) => l.id === lineX.id), "cross-project invoice lines (Reports) use the same scope");

    // 8. View All Projects = project EDIT access too: another user's project and its data.
    const send = (h: Record<string, string>, path: string, body: unknown, method = "PATCH") =>
      fetch(`${url}${path}`, { method, headers: h, body: JSON.stringify(body) });
    assert.equal((await send(acctView.h, `/projects/${PX.id}`, { projectTitle: `${TAG} edited by accounts` })).status, 200, "edit another user's project");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: PX.id } })).projectTitle, `${TAG} edited by accounts`, "saved");
    assert.equal((await send(acctView.h, `/projects/${PY.id}`, { remarks: "accounts remark" })).status, 200);
    assert.equal((await send(acctView.h, `/projects/${PX.id}/notes`, { message: "accounts note" }, "POST")).status, 201, "add note");
    assert.equal((await send(acctView.h, `/quantity/${qx.id}`, { description: "Item X (edited)" })).status, 200, "edit quantity");
    assert.equal((await prisma.quantityItem.findUniqueOrThrow({ where: { id: qx.id } })).description, "Item X (edited)");
    const expRes = await send(acctView.h, `/projects/${PY.id}/expenses`, { category: "Travel", description: "Site visit", quantity: 1, unitCost: 100 }, "POST");
    assert.equal(expRes.status, 201, `add expense (${expRes.status})`);

    // ...but no independent approval right comes with it.
    assert.equal((await fetch(`${url}/projects/${PY.id}`, { method: "DELETE", headers: acctView.h })).status, 403, "no archive without Archive Projects");
    assert.equal((await fetch(`${url}/projects/${PY.id}/permanent`, { method: "DELETE", headers: acctView.h })).status, 403, "no permanent delete");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: PY.id } })).isDeleted, false);
    assert.equal((await send(acctView.h, `/quantity/${qx.id}/invoice-lines`, {
      invoiceNo: `${TAG}-RAISE`, invoiceIntent: "new", invoiceDate: "2026-03-01", quantityBilled: 0, invoiceAmountINR: 100, status: "Draft",
    }, "POST")).status, 403, "no invoice raising without Raise Invoice");
    assert.equal((await send(acctView.h, `/invoice-lines/${lineX.id}`, { remarks: "changed" })).status, 403, "no invoice edit without Edit Invoice");
    assert.equal((await fetch(`${url}/invoice-lines/${lineX.id}`, { method: "DELETE", headers: acctView.h })).status, 403, "no invoice delete without Delete Invoice");
    assert.ok(await prisma.invoiceLine.findUnique({ where: { id: lineX.id } }), "line untouched");
    assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: `${TAG}-RAISE` } }), 0);

    // 6 (writes). Accounts WITHOUT the right keeps existing write restrictions (own project only).
    assert.equal((await send(acctPlain.h, `/projects/${PX.id}`, { projectTitle: "nope" })).status, 403);
    assert.equal((await send(acctPlain.h, `/quantity/${qx.id}`, { description: "nope" })).status, 403);
    assert.equal((await send(acctPlain.h, `/invoice-lines/${lineX.id}`, { remarks: "nope" })).status, 403, "Edit Invoice still needs project access");
    assert.equal((await send(acctPlain.h, `/projects/${PA.id}/notes`, { message: "own note" }, "POST")).status, 201, "own project still writable");

    // Existing write behaviour unchanged for PMO Manager, Administrator and Project Manager sharing.
    assert.equal((await send(pmoU.h, `/projects/${PY.id}`, { remarks: "pmo" })).status, 200);
    assert.equal((await send(adminU.h, `/projects/${PY.id}`, { remarks: "admin" })).status, 200);
    assert.equal((await send(pmU.h, `/projects/${PX.id}`, { remarks: "pm shared" })).status, 200, "PM edits a shared project");
    assert.equal((await send(pmU.h, `/projects/${PY.id}`, { remarks: "pm not shared" })).status, 403, "PM cannot edit an unshared project");

    // 9. No Projects module: the right alone opens no project screen/API.
    assert.equal((await get(acctNoProjects.h, `/projects?search=${TAG}`)).status, 403);
    assert.equal((await get(acctNoProjects.h, `/projects/${PX.id}`)).status, 403);
    assert.equal((await get(acctNoProjects.h, `/projects/${PX.id}/quantity`)).status, 403);

    // 10. Read Only: may view all, still may not write.
    assert.deepEqual(prNos(await listTagged(roView.h)), ["PA", "PX", "PY"]);
    assert.equal((await fetch(`${url}/projects/${PX.id}`, { method: "PATCH", headers: roView.h, body: JSON.stringify({ projectTitle: "ro" }) })).status, 403, "Read Only cannot edit");
    assert.equal((await fetch(`${url}/projects/${PX.id}/notes`, { method: "POST", headers: roView.h, body: JSON.stringify({ message: "ro" }) })).status, 403, "Read Only cannot add notes");
    assert.equal((await fetch(`${url}/quantity/${qx.id}`, { method: "PATCH", headers: roView.h, body: JSON.stringify({ description: "ro" }) })).status, 403, "Read Only cannot edit quantity");

    // 7. Revoking the right takes effect immediately (via Settings > User Management).
    const save = (approvalIds: string[]) =>
      fetch(`${url}/users/${acctView.user.id}`, { method: "PATCH", headers: adminU.h, body: JSON.stringify({ approvalIds }) });
    assert.equal((await save([])).status, 200);
    const me = (await (await get(acctView.h, "/auth/me")).json()) as { data: { approvals: string[] } };
    assert.ok(!me.data.approvals.includes("View All Projects"));
    assert.deepEqual(prNos(await listTagged(acctView.h)), [], "no own projects -> nothing visible");
    assert.equal((await get(acctView.h, `/projects/${PX.id}`)).status, 403);
    assert.equal((await fetch(`${url}/projects/${PX.id}`, { method: "PATCH", headers: acctView.h, body: JSON.stringify({ remarks: "after revoke" }) })).status, 403, "edit access revoked immediately");
    // ...and granting it again restores visibility, also immediately; it persists in /auth/me.
    assert.equal((await save([VIEW_ALL])).status, 200);
    const me2 = (await (await get(acctView.h, "/auth/me")).json()) as { data: { approvals: string[] } };
    assert.ok(me2.data.approvals.includes("View All Projects"));
    assert.equal((await get(acctView.h, `/projects/${PY.id}`)).status, 200);

    // PM sharing list itself untouched by any of the above.
    assert.equal(await prisma.projectManagerScope.count({ where: { projectManagerId: pmU.user.id } }), 1);
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectNote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectExpense.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.projectManagerScope.deleteMany({ where: { projectManagerId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
