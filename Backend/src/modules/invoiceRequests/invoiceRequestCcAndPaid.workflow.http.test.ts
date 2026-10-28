import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { invoiceEditDeleteGrants } from "../invoices/invoiceApprovalGrants.testutil.js";

/**
 * Request Invoice -> Invoice Raised -> Invoice Paid CC/Paid-email extension
 * (Oct 2026). Covers what invoiceRequest.workflow.http.test.ts does not:
 *
 * - CC Members are validated server-side (invalid/inactive/nonexistent ids
 *   silently dropped, duplicates deduped) and persisted as
 *   InvoiceRequestCcMember rows.
 * - The persisted CC set survives unchanged through the Raised stage.
 * - Invoice Paid fires exactly once on a genuine transition (Raised -> Paid),
 *   never again on Paid -> Paid or an unrelated edit while already Paid.
 * - PartiallyPaid -> Paid also fires (a genuine transition, different FROM
 *   state).
 * - An InvoiceLine never linked to any InvoiceRequest (raised outside this
 *   workflow entirely) produces no Invoice Paid notification at all — there
 *   is no "original requester" to notify, by design.
 *
 * Email recipient/CC composition itself (mandatory recipients,
 * dedup, multiple members) is covered exhaustively and fast by the pure
 * unit tests in invoiceRequestEmail.rules.test.ts — this file proves the
 * wiring (DB persistence + the real HTTP/transition triggers), not the
 * composition logic itself, matching invoiceRequest.workflow.http.test.ts's
 * own existing convention of asserting in-app Notification side effects
 * rather than literal SMTP payloads.
 */

const TAG = `invreqcc-${Date.now()}`;

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

async function waitForInvoicePaidNotification(userId: string, invoiceNoFragment: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await prisma.notification.findFirst({
      where: { userId, type: "INVOICE_PAID", message: { contains: invoiceNoFragment } },
    });
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test("Request Invoice -> Raised -> Paid — CC Members persistence and Paid-transition guard", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvReqCcTest@123");

    async function makeUser(label: string, extra: Record<string, unknown> = {}) {
      const u = await prisma.portalUser.create({
        data: {
          fullName: `Invoice Request CC ${label}`,
          email: `${TAG}-${label.toLowerCase()}@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          ...extra,
        },
      });
      createdUserIds.push(u.id);
      return u;
    }

    const userA = await makeUser("Requester", { moduleAccess: { create: { moduleId: invoicesModule.id } } });
    const userB = await makeUser("Raiser", {
      moduleAccess: { create: { moduleId: invoicesModule.id } },
      approvalPermissions: { create: [{ approvalTypeId: raiseInvoiceApproval.id }, ...(await invoiceEditDeleteGrants())] },
    });
    const ccUser1 = await makeUser("CcOne");
    const ccUser2 = await makeUser("CcTwo");
    const inactiveCcUser = await makeUser("CcInactive", { isActive: false });

    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });

    async function makeProjectWithQuantityItem(suffix: string, woValue: number) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-10",
          prCategory: "India",
          prNo: `${TAG}-PR-${suffix}`,
          client: "Invoice Request CC Client",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `Invoice Request CC/Paid regression ${suffix}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectEndDate: new Date("2026-12-31"),
          projectStatus: "Active",
          workOrderNumber: `${TAG}-WO-${suffix}`,
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
          description: `Invoice Request CC Test Item ${suffix}`,
          woQty: 10,
          uom: "DAY",
          unitRate: woValue / 10,
          exchangeRate: 1,
          unitRateINR: woValue / 10,
          woValue,
        },
      });
      return { project, quantityItem };
    }

    async function raise(quantityItemId: string, invoiceNo: string, amount: number, status: string) {
      const draftRes = await fetch(`${url}/quantity/${quantityItemId}/invoice-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({
          invoiceNo,
          invoiceDate: new Date("2026-02-01").toISOString(),
          quantityBilled: 1,
          invoiceAmountINR: amount,
          status: "Draft",
        }),
      });
      assert.equal(draftRes.status, 201);
      const line = ((await draftRes.json()) as { data: { id: string } }).data;

      if (status !== "Draft") {
        const patchRes = await fetch(`${url}/invoice-lines/${line.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
          body: JSON.stringify({ status }),
        });
        assert.equal(patchRes.status, 200);
      }
      return line.id;
    }

    async function patchStatus(lineId: string, status: string) {
      const res = await fetch(`${url}/invoice-lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ status }),
      });
      assert.equal(res.status, 200);
    }

    // ===================================================================
    // Scenario A — CC persistence + validation, Raised-stage integrity,
    // exactly-once Paid guard (Raised -> Paid, then Paid -> Paid, then an
    // unrelated edit while Paid).
    // ===================================================================
    const { project: projectA, quantityItem: qiA } = await makeProjectWithQuantityItem("A", 50_000);

    const createReqA = await fetch(`${url}/projects/${projectA.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        assignedToUserId: userB.id,
        ccMemberUserIds: [
          ccUser1.id,
          ccUser2.id,
          ccUser2.id, // duplicate — must not persist twice
          inactiveCcUser.id, // inactive — must be dropped
          "00000000-0000-0000-0000-000000000000", // nonexistent — must be dropped
        ],
      }),
    });
    assert.equal(createReqA.status, 201);
    const reqA = ((await createReqA.json()) as {
      data: { id: string; ccMembers: { id: string }[] };
    }).data;
    assert.deepEqual(
      [...reqA.ccMembers.map((m) => m.id)].sort(),
      [ccUser1.id, ccUser2.id].sort(),
      "only the valid, active, deduped CC ids must be persisted and returned"
    );

    const ccRowsA = await prisma.invoiceRequestCcMember.findMany({ where: { invoiceRequestId: reqA.id } });
    assert.equal(ccRowsA.length, 2, "exactly two InvoiceRequestCcMember rows, never duplicated, never the dropped ids");
    assert.deepEqual(
      [...ccRowsA.map((r) => r.portalUserId)].sort(),
      [ccUser1.id, ccUser2.id].sort()
    );

    const lineA = await raise(qiA.id, `${TAG}-INV-A`, 5000, "Raised");

    // Fulfillment + CC integrity through the Raised stage.
    let fulfilledA: { ccMembers: { id: string }[] } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.invoiceRequest.findUnique({
        where: { id: reqA.id },
        include: { ccMembers: { include: { portalUser: { select: { id: true, fullName: true, email: true } } } } },
      });
      if (row && row.status === "Completed") {
        fulfilledA = { ccMembers: row.ccMembers.map((m) => ({ id: m.portalUserId })) };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fulfilledA, "the request must be Completed once raised");
    assert.deepEqual(
      [...fulfilledA!.ccMembers.map((m) => m.id)].sort(),
      [ccUser1.id, ccUser2.id].sort(),
      "the exact same CC Members selected at submission must still be attached after Raised — never reconstructed"
    );

    // Paid — exactly once.
    await patchStatus(lineA, "Paid");
    const firstPaidNotification = await waitForInvoicePaidNotification(userA.id, "INV-A");
    assert.ok(firstPaidNotification, "the original requester must be notified once the invoice becomes Paid");

    // Paid -> Paid (re-save, same status) — must NOT fire again.
    await patchStatus(lineA, "Paid");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const countAfterResave = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-A" } },
    });
    assert.equal(countAfterResave, 1, "Paid -> Paid must never send a duplicate Invoice Paid notification/email");

    // An unrelated edit (remarks) while already Paid — must NOT fire again.
    const unrelatedEditRes = await fetch(`${url}/invoice-lines/${lineA}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ remarks: "unrelated edit, status untouched" }),
    });
    assert.equal(unrelatedEditRes.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const countAfterUnrelatedEdit = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-A" } },
    });
    assert.equal(countAfterUnrelatedEdit, 1, "an unrelated edit that leaves status Paid must never send Invoice Paid again");

    // ===================================================================
    // Scenario B — PartiallyPaid -> Paid is a genuine transition too (a
    // different FROM state than Scenario A's Raised -> Paid).
    // ===================================================================
    const { project: projectB, quantityItem: qiB } = await makeProjectWithQuantityItem("B", 50_000);
    const createReqB = await fetch(`${url}/projects/${projectB.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id, ccMemberUserIds: [ccUser1.id] }),
    });
    assert.equal(createReqB.status, 201);
    const lineB = await raise(qiB.id, `${TAG}-INV-B`, 5000, "Raised");
    // Wait for fulfillment before transitioning further, so Paid resolves
    // against an already-Completed request (same real-world ordering).
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.invoiceLine.findUnique({ where: { id: lineB } });
      if (row?.status === "Raised") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await patchStatus(lineB, "PartiallyPaid");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const notificationAfterPartiallyPaid = await prisma.notification.findFirst({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-B" } },
    });
    assert.equal(notificationAfterPartiallyPaid, null, "Raised -> PartiallyPaid must never send Invoice Paid");

    await patchStatus(lineB, "Paid");
    const paidAfterPartially = await waitForInvoicePaidNotification(userA.id, "INV-B");
    assert.ok(paidAfterPartially, "PartiallyPaid -> Paid is a genuine transition and must send Invoice Paid");

    // ===================================================================
    // Scenario C — an InvoiceLine never linked to any InvoiceRequest (no
    // Request Invoice was ever submitted for this project) must produce NO
    // Invoice Paid notification at all — there is no original requester.
    // ===================================================================
    const { quantityItem: qiC } = await makeProjectWithQuantityItem("C", 50_000);
    const lineC = await raise(qiC.id, `${TAG}-INV-C`, 5000, "Raised");
    await patchStatus(lineC, "Paid");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const notificationForUnlinkedLine = await prisma.notification.findFirst({
      where: { type: "INVOICE_PAID", message: { contains: "INV-C" } },
    });
    assert.equal(
      notificationForUnlinkedLine,
      null,
      "an InvoiceLine raised outside the Request Invoice workflow must never trigger an Invoice Paid notification"
    );
  } finally {
    await prisma.invoiceRequestCcMember.deleteMany({
      where: { invoiceRequest: { projectId: { in: createdProjectIds } } },
    });
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
