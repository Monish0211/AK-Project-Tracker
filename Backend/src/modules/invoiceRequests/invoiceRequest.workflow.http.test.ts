import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Request Invoice workflow (Sept 2026) — full authorization + fulfillment
 * matrix per the approved implementation spec:
 *
 * - User A (Invoices access, no "Raise Invoice" permission): can view/
 *   request, cannot raise (backend 403 on a direct API attempt to create OR
 *   to PATCH an existing Draft line's status to "Raised" — the bypass fix).
 * - User B (Invoices access + "Raise Invoice"): eligible for
 *   GET /users/eligible-invoice-raisers, receives the request notification,
 *   completes the raise, the InvoiceRequest becomes Completed with
 *   fulfilledInvoiceLineId set.
 * - User C (the requester): gets notified once the invoice is actually
 *   raised (never before).
 * - Duplicate-submission guard: a second Request Invoice while one is still
 *   Open is rejected with 409.
 * - Send Invoice To: any active user may be a recipient, an inactive/
 *   nonexistent id is silently dropped, never emailed.
 */

const TAG = `invreq-${Date.now()}`;

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

test("Request Invoice workflow — authorization matrix, fulfillment, duplicate guard, Send Invoice To", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule, raiseInvoiceApproval] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } }),
    ]);
    const passwordHash = await hashPassword("InvReqTest@123");

    // User A — requester, Invoices access, no Raise Invoice permission.
    const userA = await prisma.portalUser.create({
      data: {
        fullName: "Invoice Request User A",
        email: `${TAG}-a@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
      },
    });
    // User B — responsible person, holds Raise Invoice.
    const userB = await prisma.portalUser.create({
      data: {
        fullName: "Invoice Request User B",
        email: `${TAG}-b@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
        approvalPermissions: { create: { approvalTypeId: raiseInvoiceApproval.id } },
      },
    });
    // Inactive user — must never appear in the eligibility list even
    // though it holds the permission.
    const inactiveEligible = await prisma.portalUser.create({
      data: {
        fullName: "Invoice Request Inactive Eligible",
        email: `${TAG}-inactive@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        isActive: false,
        moduleAccess: { create: { moduleId: invoicesModule.id } },
        approvalPermissions: { create: { approvalTypeId: raiseInvoiceApproval.id } },
      },
    });
    createdUserIds.push(userA.id, userB.id, inactiveEligible.id);

    const tokenA = tokenFor({ ...userA, roleName: engineerRole.name });
    const tokenB = tokenFor({ ...userB, roleName: engineerRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-09",
        prCategory: "India",
        prNo: `${TAG}-PR`,
        client: "Invoice Request Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Invoice Request workflow regression",
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
        description: "Invoice Request Test Item",
        woQty: 10,
        uom: "DAY",
        unitRate: 5000,
        exchangeRate: 1,
        unitRateINR: 5000,
        woValue: 50_000,
      },
    });

    // ---- Eligibility endpoint: only active + permitted users ----
    const eligibleRes = await fetch(`${url}/users/eligible-invoice-raisers`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(eligibleRes.status, 200);
    const eligibleJson = (await eligibleRes.json()) as { data: { id: string; fullName: string }[] };
    const eligibleIds = eligibleJson.data.map((u) => u.id);
    assert.ok(eligibleIds.includes(userB.id), "User B must appear in the eligibility list");
    assert.ok(!eligibleIds.includes(inactiveEligible.id), "an inactive user must never appear, even if permitted");

    // ---- User A: direct raise attempt is rejected ----
    const directRaise = await fetch(`${url}/quantity/${quantityItem.id}/invoice-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        invoiceNo: `${TAG}-DIRECT`,
        invoiceDate: new Date("2026-02-01").toISOString(),
        quantityBilled: 1,
        invoiceAmountINR: 5000,
        status: "Raised",
      }),
    });
    assert.equal(directRaise.status, 403, "User A must not be able to raise an invoice directly");

    // ---- User A: Request Invoice succeeds ----
    const createReq = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id, notes: "Please raise this one." }),
    });
    assert.equal(createReq.status, 201);
    const invoiceRequest = ((await createReq.json()) as { data: { id: string; status: string } }).data;
    assert.equal(invoiceRequest.status, "Open");

    // ---- Duplicate guard: a second request for the same project is rejected ----
    const duplicateReq = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id }),
    });
    assert.equal(duplicateReq.status, 409, "a second Open request for the same project must be rejected");

    // ---- User B was notified of the request ----
    const assignedNotification = await prisma.notification.findFirst({
      where: { userId: userB.id, type: "INVOICE_REQUEST_ASSIGNED" },
    });
    assert.ok(assignedNotification, "User B must receive an Invoice Request Assigned notification");

    // ---- Bypass fix: create a Draft line (User B holds the permission —
    // creation itself is gated, so only B can create at all), then confirm
    // User A cannot PATCH it to Raised. ----
    const draftRes = await fetch(`${url}/quantity/${quantityItem.id}/invoice-lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        invoiceNo: `${TAG}-INV-1`,
        invoiceDate: new Date("2026-02-01").toISOString(),
        quantityBilled: 1,
        invoiceAmountINR: 5000,
        status: "Draft",
      }),
    });
    assert.equal(draftRes.status, 201);
    const draftLine = ((await draftRes.json()) as { data: { id: string } }).data;

    const bypassAttempt = await fetch(`${url}/invoice-lines/${draftLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ status: "Raised" }),
    });
    assert.equal(bypassAttempt.status, 403, "PATCHing a Draft line's status to Raised must be gated identically to create");
    const lineAfterBypassAttempt = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draftLine.id } });
    assert.equal(lineAfterBypassAttempt.status, "Draft", "a rejected bypass attempt must leave the line's status unchanged");

    // ---- User B raises it for real (PATCH Draft -> Raised) ----
    const realRaise = await fetch(`${url}/invoice-lines/${draftLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ status: "Raised" }),
    });
    assert.equal(realRaise.status, 200, "User B, who holds Raise Invoice, must be able to complete the transition");

    // ---- Fulfillment: the Invoice Request is now Completed, linked to this exact line ----
    // Fire-and-forget notification/fulfillment work is not awaited by the
    // HTTP response — poll briefly for the async completion to land.
    let fulfilled: { status: string; fulfilledInvoiceLineId: string | null } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const row = await prisma.invoiceRequest.findUnique({ where: { id: invoiceRequest.id } });
      if (row && row.status === "Completed") {
        fulfilled = { status: row.status, fulfilledInvoiceLineId: row.fulfilledInvoiceLineId };
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(fulfilled, "the Invoice Request must transition to Completed once the invoice is actually raised");
    assert.equal(fulfilled!.fulfilledInvoiceLineId, draftLine.id);

    // ---- User A (the requester) was notified that the invoice was raised ----
    let requesterNotified = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const notification = await prisma.notification.findFirst({
        where: { userId: userA.id, type: "INVOICE_REQUEST_FULFILLED" },
      });
      if (notification) {
        requesterNotified = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(requesterNotified, "the original requester must be notified once the invoice is actually raised");

    // ---- A new Request Invoice is allowed again now that none is Open ----
    const secondReq = await fetch(`${url}/projects/${project.id}/invoice-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ assignedToUserId: userB.id }),
    });
    assert.equal(secondReq.status, 201, "a new request may be created once no Open request remains for this project");
    const secondInvoiceRequest = ((await secondReq.json()) as { data: { id: string } }).data;

    // ---- Send Invoice To: multiple real recipients succeed together, inactive/nonexistent ids are dropped ----
    // Performance fix (independent review) — this call used to be measured
    // at ~2.1s (awaited notify()+sequential per-recipient sendEmail() before
    // responding); it is now fire-and-forget, so the response itself must
    // return quickly regardless of how many recipients or how slow SMTP is.
    const sendToStart = Date.now();
    const sendToRes = await fetch(`${url}/invoice-lines/${draftLine.id}/send-to`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        userIds: [userA.id, userB.id, inactiveEligible.id, "00000000-0000-0000-0000-000000000000"],
      }),
    });
    const sendToElapsedMs = Date.now() - sendToStart;
    assert.equal(sendToRes.status, 200);
    const sendToJson = (await sendToRes.json()) as { data: { sentTo: string[] } };
    assert.deepEqual(
      [...sendToJson.data.sentTo].sort(),
      [userA.id, userB.id].sort(),
      "every real, active recipient must be included — both User A and User B here — while the inactive and nonexistent ids are silently dropped"
    );
    assert.ok(
      sendToElapsedMs < 1000,
      `Send Invoice To must respond well under 1s regardless of SMTP latency — took ${sendToElapsedMs}ms`
    );

    // ---- Cleanup of the second Invoice Request (never fulfilled) ----
    await prisma.invoiceRequest.delete({ where: { id: secondInvoiceRequest.id } });
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
