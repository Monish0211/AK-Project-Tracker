import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Project Repository Invoice Status (Oct 2026) — the server figures the Repository's status is derived from:
 * workOrderValueINR / pendingDueINR (unchanged) and allInvoicesPaid (new). "Paid" is shown only when the Work Order Value is fully
 * invoiced AND allInvoicesPaid is true. Reproduces PR-12005 (WO ₹1,65,000; Invoice 1 ₹1,32,000 Paid; Invoice 2 ₹33,000 Raised).
 */

const TAG = `repostatus-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))) };
}

type Figures = { workOrderValueINR: number; pendingDueINR: number; allInvoicesPaid: boolean };

test("Project list API: allInvoicesPaid and the unchanged invoiced-amount figures across PR-12005's scenario and its variants", async () => {
  const { url, close } = await listen();
  const userIds: string[] = [];
  const projectIds: string[] = [];
  try {
    const [engineer, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const user = await prisma.portalUser.create({
      data: {
        fullName: "Repo Status Tester",
        email: `${TAG}@example.com`,
        passwordHash: await hashPassword("RepoStatus@123"),
        department: "PMO",
        roleId: engineer.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    userIds.push(user.id);
    const token = signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: engineer.name });

    /** A project with WO value 1,65,000 and the given invoice lines (status, amount). */
    async function makeProject(key: string, lines: [string, number][], woValue = 165_000) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-09", prCategory: "India", prNo: `${TAG}-${key}`, client: "Repo Status Client", department: "Process",
          domesticForeign: "Domestic", projectTitle: `Repository status ${key}`, workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"), projectEndDate: new Date("2026-12-31"), projectStatus: "Active",
          workOrderNumber: `${TAG}-${key}-WO`, workOrderDate: new Date("2026-01-01"), eicName: "EIC", contractType: "LUMP SUM",
          pmoCoordinator: "PMO", createdByUserId: null,
        },
      });
      projectIds.push(project.id);
      const item = await prisma.quantityItem.create({
        data: { projectId: project.id, description: "Item", woQty: 1, uom: "LS", unitRate: woValue, exchangeRate: 1, unitRateINR: woValue, woValue },
      });
      let n = 0;
      for (const [status, amount] of lines) {
        n += 1;
        await prisma.invoiceLine.create({
          data: {
            quantityItemId: item.id, invoiceNo: `${TAG}-${key}-${n}`, invoiceDate: new Date("2026-02-0" + n), quantityBilled: 1,
            invoiceAmountINR: amount, status, createdBy: user.id,
          },
        });
      }
      return project.id;
    }

    async function figures(projectId: string): Promise<Figures> {
      // list endpoint (what the Repository reads)…
      const prNo = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).prNo;
      const list = await fetch(`${url}/projects?search=${encodeURIComponent(prNo)}&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(list.status, 200);
      const body = (await list.json()) as { data: { items?: (Figures & { id: string })[] } | (Figures & { id: string })[] };
      const items = Array.isArray(body.data) ? body.data : body.data.items ?? [];
      const fromList = items.find((p) => p.id === projectId);
      assert.ok(fromList, "project is in the list");
      // …and the single-project endpoint must agree.
      const one = await fetch(`${url}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
      const single = ((await one.json()) as { data: Figures }).data;
      assert.deepEqual(
        { w: single.workOrderValueINR, p: single.pendingDueINR, a: single.allInvoicesPaid },
        { w: fromList.workOrderValueINR, p: fromList.pendingDueINR, a: fromList.allInvoicesPaid },
        "list and detail agree"
      );
      return { workOrderValueINR: fromList.workOrderValueINR, pendingDueINR: fromList.pendingDueINR, allInvoicesPaid: fromList.allInvoicesPaid };
    }

    // PR-12005: fully invoiced (1,32,000 + 33,000) but one invoice is still Raised → not all paid.
    assert.deepEqual(await figures(await makeProject("a", [["Paid", 132_000], ["Raised", 33_000]])), { workOrderValueINR: 165_000, pendingDueINR: 0, allInvoicesPaid: false });
    // fully invoiced and everything Paid.
    assert.deepEqual(await figures(await makeProject("b", [["Paid", 132_000], ["Paid", 33_000]])), { workOrderValueINR: 165_000, pendingDueINR: 0, allInvoicesPaid: true });
    // a Cancelled invoice is ignored — by the invoiced total AND by the paid check.
    assert.deepEqual(await figures(await makeProject("c", [["Paid", 132_000], ["Paid", 33_000], ["Cancelled", 9_999]])), { workOrderValueINR: 165_000, pendingDueINR: 0, allInvoicesPaid: true });
    // a Draft invoice counts as invoiced (unchanged) but is not Paid.
    assert.deepEqual(await figures(await makeProject("d", [["Paid", 132_000], ["Draft", 33_000]])), { workOrderValueINR: 165_000, pendingDueINR: 0, allInvoicesPaid: false });
    // a Partially Paid invoice is not Paid.
    assert.deepEqual(await figures(await makeProject("e", [["Paid", 132_000], ["PartiallyPaid", 33_000]])), { workOrderValueINR: 165_000, pendingDueINR: 0, allInvoicesPaid: false });
    // under-invoiced: the existing pending-due figure is untouched (whatever allInvoicesPaid is).
    assert.deepEqual(await figures(await makeProject("f", [["Paid", 132_000]])), { workOrderValueINR: 165_000, pendingDueINR: 33_000, allInvoicesPaid: true });
    // no invoices: nothing invoiced, never "all paid".
    assert.deepEqual(await figures(await makeProject("g", [])), { workOrderValueINR: 165_000, pendingDueINR: 165_000, allInvoicesPaid: false });
    // only Cancelled invoices: nothing invoiced, never "all paid".
    assert.deepEqual(await figures(await makeProject("h", [["Cancelled", 50_000]])), { workOrderValueINR: 165_000, pendingDueINR: 165_000, allInvoicesPaid: false });
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: projectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
    await close();
  }
});
