import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Request fulfillment — Draft -> non-Draft edge cases (Oct 2026).
 *
 * invoiceRequest.workflow.http.test.ts already proves the normal Draft ->
 * Raised path fulfills an Open request. This file covers what that one
 * doesn't: a line that skips the literal "Raised" value entirely and goes
 * straight from Draft to PartiallyPaid or Paid in a single PATCH must
 * fulfill the Open request too (the real business event is "no longer
 * Draft/Cancelled," not "became exactly Raised") — see the
 * isGenuineInvoiceTransition guard in invoice.service.ts's
 * updateInvoiceLine(). Also covers the idempotency guarantee (no duplicate
 * fulfillment notification once Completed) and the pre-existing "multiple
 * simultaneously-Open requests" safety behavior of
 * fulfillOpenInvoiceRequestsForProject() itself.
 */

const TAG = `invreqfulfil-${Date.now()}`;

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

async function waitForCompleted(
  requestId: string,
  timeoutMs = 2000
): Promise<{ status: string; fulfilledInvoiceLineId: string | null } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await prisma.invoiceRequest.findUnique({ where: { id: requestId } });
    if (row && row.status === "Completed") {
      return { status: row.status, fulfilledInvoiceLineId: row.fulfilledInvoiceLineId };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
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

test("Invoice Request fulfillment — Draft -> PartiallyPaid/Paid edge cases, idempotency, multiple Open requests", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvReqFulfilTest@123");

    async function makeUser(label: string, extra: Record<string, unknown> = {}) {
      const u = await prisma.portalUser.create({
        data: {
          fullName: `Invoice Request Fulfillment ${label}`,
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
      approvalPermissions: { create: { approvalTypeId: raiseInvoiceApproval.id } },
    });

    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });

    async function makeProjectWithQuantityItem(suffix: string) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-10",
          prCategory: "India",
          prNo: `${TAG}-PR-${suffix}`,
          client: "Invoice Request Fulfillment Client",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `Invoice Request fulfillment regression ${suffix}`,
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
          description: `Invoice Request Fulfillment Test Item ${suffix}`,
          woQty: 10,
          uom: "DAY",
          unitRate: 5000,
          exchangeRate: 1,
          unitRateINR: 5000,
          woValue: 50_000,
        },
      });
      return { project, quantityItem };
    }

    async function createDraftLine(quantityItemId: string, invoiceNo: string) {
      const res = await fetch(`${url}/quantity/${quantityItemId}/invoice-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({
          invoiceNo,
          invoiceDate: new Date("2026-02-01").toISOString(),
          quantityBilled: 1,
          invoiceAmountINR: 5000,
          status: "Draft",
        }),
      });
      assert.equal(res.status, 201);
      return ((await res.json()) as { data: { id: string } }).data.id;
    }

    async function patchStatus(lineId: string, status: string) {
      const res = await fetch(`${url}/invoice-lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ status }),
      });
      assert.equal(res.status, 200, `PATCH to ${status} must succeed`);
    }

    async function createOpenRequest(projectId: string) {
      const res = await fetch(`${url}/projects/${projectId}/invoice-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ assignedToUserId: userB.id }),
      });
      assert.equal(res.status, 201);
      return ((await res.json()) as { data: { id: string } }).data.id;
    }

    // ===================================================================
    // Scenario 1 — Draft -> PartiallyPaid directly (skips "Raised" entirely)
    // must fulfill the Open request.
    // ===================================================================
    const { project: project1, quantityItem: qi1 } = await makeProjectWithQuantityItem("1");
    const req1 = await createOpenRequest(project1.id);
    const line1 = await createDraftLine(qi1.id, `${TAG}-INV-1`);
    await patchStatus(line1, "PartiallyPaid");

    const fulfilled1 = await waitForCompleted(req1);
    assert.ok(fulfilled1, "Draft -> PartiallyPaid directly must fulfill the Open InvoiceRequest");
    assert.equal(fulfilled1!.fulfilledInvoiceLineId, line1, "fulfilledInvoiceLineId must point at the line that caused the transition");

    // ===================================================================
    // Scenario 2 — Draft -> Paid directly (skips "Raised" entirely) must
    // fulfill the Open request too.
    // ===================================================================
    const { project: project2, quantityItem: qi2 } = await makeProjectWithQuantityItem("2");
    const req2 = await createOpenRequest(project2.id);
    const line2 = await createDraftLine(qi2.id, `${TAG}-INV-2`);
    await patchStatus(line2, "Paid");

    const fulfilled2 = await waitForCompleted(req2);
    assert.ok(fulfilled2, "Draft -> Paid directly must fulfill the Open InvoiceRequest");
    assert.equal(fulfilled2!.fulfilledInvoiceLineId, line2);

    // Regression test — this is the exact race a live Playwright QA run
    // caught: fulfillment (the write) and the Invoice Paid notification
    // (the read of that same link) both originate from this single
    // Draft -> Paid PATCH. Before the ordering fix in invoice.service.ts,
    // the read could run before the write landed, find no link, and
    // silently skip the notification/email entirely. It must now exist.
    const paidNotification2 = await waitForInvoicePaidNotification(userA.id, "INV-2");
    assert.ok(
      paidNotification2,
      "Draft -> Paid directly must still create the Invoice Paid notification for the original requester, not just fulfill the request"
    );

    // ===================================================================
    // Scenario 3 — idempotency: once Completed, later transitions
    // (PartiallyPaid -> Paid, Paid -> Paid) must never re-trigger
    // fulfillment or send a second "invoice raised" notification to the
    // requester.
    // ===================================================================
    const notificationCountAfterFirstFulfillment = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_REQUEST_FULFILLED", entityId: project1.id },
    });
    assert.equal(notificationCountAfterFirstFulfillment, 1, "exactly one fulfillment notification after the first genuine transition");

    // Scenario 1's line is now PartiallyPaid — advance it to Paid and confirm no duplicate fulfillment notification.
    await patchStatus(line1, "Paid");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const notificationCountAfterPartiallyPaidToPaid = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_REQUEST_FULFILLED", entityId: project1.id },
    });
    assert.equal(
      notificationCountAfterPartiallyPaidToPaid,
      1,
      "PartiallyPaid -> Paid, after the request is already Completed, must never re-fulfill or re-notify"
    );
    const requestAfterSecondTransition = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req1 } });
    assert.equal(requestAfterSecondTransition.fulfilledInvoiceLineId, line1, "the link must remain unchanged");

    // Scenario 2's line is now Paid — resave the same status (Paid -> Paid) and confirm no duplicate fulfillment notification.
    await patchStatus(line2, "Paid");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const notificationCountAfterPaidResave = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_REQUEST_FULFILLED", entityId: project2.id },
    });
    assert.equal(notificationCountAfterPaidResave, 1, "Paid -> Paid must never re-fulfill or re-notify");
    const paidNotificationCountAfterResave = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-2" } },
    });
    assert.equal(paidNotificationCountAfterResave, 1, "Paid -> Paid must never send a duplicate Invoice Paid notification either");

    // ===================================================================
    // Scenario 4 — no Open InvoiceRequest for the project: raising an
    // invoice must not create or touch any InvoiceRequest row.
    // ===================================================================
    const { quantityItem: qi4 } = await makeProjectWithQuantityItem("4");
    const line4 = await createDraftLine(qi4.id, `${TAG}-INV-4`);
    await patchStatus(line4, "Paid");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const requestCountForProject4 = await prisma.invoiceRequest.count({
      where: { projectId: (await prisma.quantityItem.findUniqueOrThrow({ where: { id: qi4.id } })).projectId },
    });
    assert.equal(requestCountForProject4, 0, "no InvoiceRequest existed, so raising/paying an invoice must not create one");

    // ===================================================================
    // Scenario 5 — multiple simultaneously-Open requests for the same
    // project (the known edge case the API's own duplicate-guard normally
    // prevents, but which fulfillOpenInvoiceRequestsForProject() must still
    // handle safely if it ever occurs): only the oldest gets
    // fulfilledInvoiceLineId; the rest are still marked Completed.
    // ===================================================================
    const { project: project5, quantityItem: qi5 } = await makeProjectWithQuantityItem("5");
    const reqOlder = await prisma.invoiceRequest.create({
      data: { projectId: project5.id, requestedByUserId: userA.id, assignedToUserId: userB.id, status: "Open" },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reqNewer = await prisma.invoiceRequest.create({
      data: { projectId: project5.id, requestedByUserId: userA.id, assignedToUserId: userB.id, status: "Open" },
    });

    const line5 = await createDraftLine(qi5.id, `${TAG}-INV-5`);
    await patchStatus(line5, "Paid");

    const olderResult = await waitForCompleted(reqOlder.id);
    const newerResult = await waitForCompleted(reqNewer.id);
    assert.ok(olderResult, "the older Open request must also be marked Completed");
    assert.ok(newerResult, "the newer Open request must also be marked Completed");
    assert.equal(olderResult!.fulfilledInvoiceLineId, line5, "the OLDEST Open request gets the real link");
    assert.equal(newerResult!.fulfilledInvoiceLineId, null, "any additional Open request is Completed WITHOUT a link");

    // ===================================================================
    // Scenario 6 — the normal, pre-existing two-step flow (Draft -> Raised,
    // THEN LATER, separately, Raised -> Paid) must remain exactly as it
    // was: fulfillment fires once at the Draft -> Raised step with no Paid
    // notification yet, and the Paid notification fires once at the later
    // Raised -> Paid step, reading a link that has long since settled.
    // Proves the ordering fix for Scenario 2 didn't change this path.
    // ===================================================================
    const { project: project6, quantityItem: qi6 } = await makeProjectWithQuantityItem("6");
    const req6 = await createOpenRequest(project6.id);
    const line6 = await createDraftLine(qi6.id, `${TAG}-INV-6`);

    await patchStatus(line6, "Raised");
    const fulfilled6 = await waitForCompleted(req6);
    assert.ok(fulfilled6, "Draft -> Raised must still fulfill the Open InvoiceRequest, unchanged");
    assert.equal(fulfilled6!.fulfilledInvoiceLineId, line6);
    const paidNotificationBeforePaid = await prisma.notification.findFirst({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-6" } },
    });
    assert.equal(paidNotificationBeforePaid, null, "Draft -> Raised alone must never send an Invoice Paid notification");

    await patchStatus(line6, "Paid");
    const paidNotification6 = await waitForInvoicePaidNotification(userA.id, "INV-6");
    assert.ok(paidNotification6, "the later, separate Raised -> Paid transition must still send the Invoice Paid notification");
    const paidNotificationCount6 = await prisma.notification.count({
      where: { userId: userA.id, type: "INVOICE_PAID", message: { contains: "INV-6" } },
    });
    assert.equal(paidNotificationCount6, 1, "exactly one Invoice Paid notification for the normal Raised -> Paid transition");
  } finally {
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
