import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Currency feature — Phase 1 backward-compatibility regression
 * (Oct 2026). Proves that every EXISTING caller — which sends no
 * currency/exchangeRateToINR/invoiceAmountOriginal field at all, because no
 * UI for this feature exists yet — gets byte-identical behavior to before
 * these columns existed: same INR amounts, same financial aggregates
 * (workOrderValueINR/pendingDueINR), same Invoice Request fulfillment, same
 * inability to ever change currency via PATCH. This is NOT a test of the
 * new feature's own business rules (Phase 2+, not yet implemented) — it is
 * a test that Phase 1's additive schema change broke nothing that already
 * worked.
 */

const TAG = `invcurrencycompat-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

test("Invoice Currency Phase 1 — existing (no-currency) callers remain byte-identical", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule, projectsModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
      prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
      prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvCurrencyCompatTest@123");

    const userA = await prisma.portalUser.create({
      data: {
        fullName: "InvCurrencyCompat Requester",
        email: `${TAG}-a@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
      },
    });
    const userB = await prisma.portalUser.create({
      data: {
        fullName: "InvCurrencyCompat Raiser",
        email: `${TAG}-b@example.com`,
        passwordHash,
        department: "Accounts",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
        approvalPermissions: { create: { approvalTypeId: raiseInvoiceApproval.id } },
      },
    });
    createdUserIds.push(userA.id, userB.id);
    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-10",
        prCategory: "India",
        prNo: `${TAG}-PR`,
        client: "InvCurrencyCompat Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Invoice Currency Phase 1 backward-compat regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: null,
      },
    });
    createdProjectIds.push(project.id);
    const quantityItem = await prisma.quantityItem.create({
      data: {
        projectId: project.id,
        description: "InvCurrencyCompat Test Item",
        woQty: 10,
        uom: "DAY",
        unitRate: 5000,
        exchangeRate: 1,
        unitRateINR: 5000,
        woValue: 50_000,
      },
    });

    // =================================================================
    // 1. A plain Request Invoice + Raise Invoice cycle, through the exact
    // same request bodies the current UI already sends (no currency field
    // anywhere) — the single most important backward-compat proof.
    // =================================================================
    const createReq = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id }),
    });
    assert.equal(createReq.status, 201);
    const invoiceRequest = ((await createReq.json()) as { data: { id: string } }).data;

    const createLineRes = await fetch(`${url}/quantity/${quantityItem.id}/invoice-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        invoiceNo: `${TAG}-INV-1`,
        invoiceDate: new Date("2026-02-01").toISOString(),
        quantityBilled: 2,
        invoiceAmountINR: 10_000,
        status: "Raised",
      }),
    });
    assert.equal(createLineRes.status, 201, "the existing Raise Invoice request body, unchanged, must still succeed");
    const line = ((await createLineRes.json()) as {
      data: {
        id: string;
        invoiceAmountINR: number;
        currency: string;
        exchangeRateToINR: number;
        invoiceAmountOriginal: number | null;
      };
    }).data;

    // 2. The response now carries the new fields, but every value is
    // exactly what a caller unaware of this feature would expect: INR,
    // rate 1, original amount identical to the INR amount.
    assert.equal(line.invoiceAmountINR, 10_000, "the INR amount itself must be completely unaffected");
    assert.equal(line.currency, "INR", "a caller that never mentions currency must default to INR");
    assert.equal(line.exchangeRateToINR, 1, "a caller that never mentions a rate must default to 1");
    assert.equal(
      line.invoiceAmountOriginal,
      10_000,
      "with no original-currency amount supplied, it must default to the INR amount, not be left null or 0"
    );

    // =================================================================
    // 3. Existing financial aggregates (Project Repository's own numbers)
    // must compute exactly as before — the new columns must never leak
    // into or alter workOrderValueINR/pendingDueINR.
    // =================================================================
    const projectRes = await fetch(`${url}/projects/${project.id}`, { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(projectRes.status, 200);
    const projectDto = ((await projectRes.json()) as {
      data: { workOrderValueINR: number; pendingDueINR: number; hasOpenInvoiceRequest: boolean };
    }).data;
    assert.equal(projectDto.workOrderValueINR, 50_000, "Work Order Value must be the unchanged, real figure");
    assert.equal(projectDto.pendingDueINR, 40_000, "Pending Due (50,000 - 10,000 raised) must compute exactly as before Phase 1");

    // =================================================================
    // 4. Existing Invoice Request fulfillment + notification workflow is
    // completely unaffected by the new schema (re-proving, post-migration,
    // what the full suite already covers — explicit here for this specific
    // regression's own report).
    // =================================================================
    let fulfilled: { status: string; fulfilledInvoiceLineId: string | null } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.invoiceRequest.findUnique({ where: { id: invoiceRequest.id } });
      if (row && row.status === "Completed") {
        fulfilled = { status: row.status, fulfilledInvoiceLineId: row.fulfilledInvoiceLineId };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fulfilled, "fulfillment must still work exactly as before Phase 1");
    assert.equal(fulfilled!.fulfilledInvoiceLineId, line.id);

    // =================================================================
    // 5. currency/exchangeRateToINR are frozen at creation. Phase 2 (Oct
    // 2026) changed HOW: a PATCH that tries to change them is now rejected
    // explicitly with 400 (previously Zod silently stripped them and
    // returned 200). No UI has ever sent such a body, so no existing caller
    // is affected; the stored values are unchanged either way.
    // =================================================================
    const patchRes = await fetch(`${url}/invoice-lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: 120.48, remarks: "attempted currency change via PATCH" }),
    });
    assert.equal(patchRes.status, 400, "an attempt to change currency/rate is rejected, never silently applied");
    const unchanged = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(unchanged.currency, "INR", "currency must remain immutable — PATCH can never change it");
    assert.equal(unchanged.exchangeRateToINR, 1, "exchangeRateToINR must remain immutable");
    assert.equal(unchanged.invoiceAmountOriginal, 10_000, "invoiceAmountOriginal must remain immutable");
    assert.equal(unchanged.remarks, null, "a rejected PATCH applies none of its fields (no partial update)");

    // The PATCH body the existing UI actually sends (full payload, no
    // currency fields) still works exactly as before — and an INR amount
    // edit now keeps invoiceAmountOriginal in step with it.
    const legacyPatchRes = await fetch(`${url}/invoice-lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ invoiceAmountINR: 12_000, quantityBilled: 2, remarks: "legacy-shaped PATCH", status: "Raised" }),
    });
    assert.equal(legacyPatchRes.status, 200, "the existing PATCH body must still succeed");
    const patchedLine = ((await legacyPatchRes.json()) as {
      data: { invoiceAmountINR: number; currency: string; exchangeRateToINR: number; invoiceAmountOriginal: number | null; remarks: string | null };
    }).data;
    assert.equal(patchedLine.invoiceAmountINR, 12_000);
    assert.equal(patchedLine.currency, "INR");
    assert.equal(patchedLine.exchangeRateToINR, 1);
    assert.equal(patchedLine.invoiceAmountOriginal, 12_000, "an INR amount edit keeps invoiceAmountOriginal equal to it");
    assert.equal(patchedLine.remarks, "legacy-shaped PATCH");
  } finally {
    await prisma.invoiceRequestCcMember.deleteMany({ where: { invoiceRequest: { projectId: { in: createdProjectIds } } } });
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
