import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Sept 2026 — Reports/Dashboard Invoice Raised discrepancy fix
 * (GET /invoice-items). Reports.tsx previously derived Invoice Raised/Cash
 * Realized entirely from each project's own browser-local invoiceItems
 * mirror, which was only ever populated by actually opening that project's
 * Edit/View page at least once in that browser — silently under-counting
 * every project that never was. This endpoint returns every invoice line
 * across every project the caller is authorized to see, in one request, so
 * Reports can compute the exact same figures the Dashboard's own KPI does.
 *
 * Proves:
 *  - Same project-visibility rule as every other cross-project list: a
 *    normal user sees only their own authorized project's lines, a
 *    different normal user sees neither, PMO Manager/Administrator see all.
 *  - The endpoint returns RAW lines (a Cancelled line is present, not
 *    filtered) — business rules are the caller's responsibility, exactly as
 *    documented on listAllInvoiceLinesForCaller(). Applying the same rule
 *    dashboard.formulas.ts documents (invoiceRaisedFromLines/
 *    paymentReceivedFromLines) against this raw data confirms: Cancelled is
 *    excluded from Invoice Raised, only Paid contributes to Cash Realized,
 *    and PartiallyPaid never invents a partial cash amount.
 */

const TAG = `all-inv-lines-${Date.now()}`;

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

function projectPayload(prNo: string, createdByUserId: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "All Invoice Lines Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "All invoice lines regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId,
  };
}

test("GET /invoice-items — authoritative cross-project invoice lines follow the same project-visibility rule and remain raw (business rules applied by the caller)", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, pmoManagerRole, invoicesModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    ]);
    const passwordHash = await hashPassword("AllInvLinesTest@123");

    const [ownerUser, otherUser, pmoManagerUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "All Inv Lines Owner",
          email: `${TAG}-owner@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: invoicesModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "All Inv Lines Unrelated User",
          email: `${TAG}-other@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: invoicesModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "All Inv Lines PMO Manager",
          email: `${TAG}-pmomanager@example.com`,
          passwordHash,
          department: "PMO",
          roleId: pmoManagerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: invoicesModule.id } },
        },
      }),
    ]);
    createdUserIds.push(ownerUser.id, otherUser.id, pmoManagerUser.id);

    const ownerProject = await prisma.project.create({ data: projectPayload(`${TAG}-A`, ownerUser.id) });
    const otherProject = await prisma.project.create({ data: projectPayload(`${TAG}-B`, otherUser.id) });
    createdProjectIds.push(ownerProject.id, otherProject.id);

    async function makeQuantityItem(projectId: string, woValue: number) {
      return prisma.quantityItem.create({
        data: {
          projectId,
          description: "All Inv Lines probe activity",
          woQty: 1,
          uom: "LOT",
          currency: "INR",
          unitRate: woValue,
          exchangeRate: 1,
          unitRateINR: woValue,
          woValue,
        },
      });
    }

    const ownerQtyItem = await makeQuantityItem(ownerProject.id, 100000);
    const otherQtyItem = await makeQuantityItem(otherProject.id, 50000);

    async function makeLine(quantityItemId: string, invoiceNo: string, status: string, amount: number) {
      return prisma.invoiceLine.create({
        data: {
          quantityItemId,
          invoiceNo,
          invoiceDate: new Date("2026-06-01"),
          quantityBilled: 0,
          invoiceAmountINR: amount,
          status,
          createdBy: "All Inv Lines Test",
        },
      });
    }

    const raisedLine = await makeLine(ownerQtyItem.id, `${TAG}-INV-1`, "Raised", 40000);
    const paidLine = await makeLine(ownerQtyItem.id, `${TAG}-INV-2`, "Paid", 20000);
    const cancelledLine = await makeLine(ownerQtyItem.id, `${TAG}-INV-3`, "Cancelled", 999999);
    const otherLine = await makeLine(otherQtyItem.id, `${TAG}-INV-4`, "PartiallyPaid", 15000);

    type LinesResponse = {
      success: boolean;
      data: {
        items: { id: string; projectId: string; quantityItemId: string; status: string; invoiceAmountINR: number; invoiceNo: string }[];
      };
    };

    const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
    const ownerToken = tokenFor({ ...ownerUser, roleName: engineerRole.name });
    const otherToken = tokenFor({ ...otherUser, roleName: engineerRole.name });
    const pmoManagerToken = tokenFor({ ...pmoManagerUser, roleName: pmoManagerRole.name });

    // --- Owner: sees all 3 of their own project's lines (Raised, Paid, AND
    // Cancelled — raw, unfiltered), never the other project's line ---
    const ownerRes = await fetch(`${url}/invoice-items`, { headers: authHeaders(ownerToken) });
    assert.equal(ownerRes.status, 200);
    const ownerBody = (await ownerRes.json()) as LinesResponse;
    const ownerIds = new Set(ownerBody.data.items.map((l) => l.id));
    assert.ok(ownerIds.has(raisedLine.id));
    assert.ok(ownerIds.has(paidLine.id));
    assert.ok(ownerIds.has(cancelledLine.id), "Cancelled line must still be present in the raw response — filtering is the caller's job");
    assert.ok(!ownerIds.has(otherLine.id), "Owner must not see the unrelated project's line");

    // --- Unrelated user: sees only their own project's line ---
    const otherRes = await fetch(`${url}/invoice-items`, { headers: authHeaders(otherToken) });
    assert.equal(otherRes.status, 200);
    const otherBody = (await otherRes.json()) as LinesResponse;
    const otherIds = new Set(otherBody.data.items.map((l) => l.id));
    assert.ok(otherIds.has(otherLine.id));
    assert.ok(!otherIds.has(raisedLine.id) && !otherIds.has(paidLine.id) && !otherIds.has(cancelledLine.id));

    // --- PMO Manager (unrestricted visibility): sees all 4 lines ---
    const pmoManagerRes = await fetch(`${url}/invoice-items`, { headers: authHeaders(pmoManagerToken) });
    assert.equal(pmoManagerRes.status, 200);
    const pmoManagerBody = (await pmoManagerRes.json()) as LinesResponse;
    const pmoManagerIds = new Set(pmoManagerBody.data.items.map((l) => l.id));
    assert.ok([raisedLine.id, paidLine.id, cancelledLine.id, otherLine.id].every((id) => pmoManagerIds.has(id)));

    // --- Unauthenticated: rejected ---
    const unauthRes = await fetch(`${url}/invoice-items`);
    assert.equal(unauthRes.status, 401);

    // --- Business rule, applied to this raw data exactly as
    // dashboard.formulas.ts documents (invoiceRaisedFromLines/
    // paymentReceivedFromLines): Cancelled excluded from Invoice Raised,
    // only Paid counts toward Cash Realized, PartiallyPaid invents nothing.
    const ownerLines = ownerBody.data.items.filter((l) => l.projectId === ownerProject.id);
    const invoiceRaised = ownerLines.filter((l) => l.status !== "Cancelled").reduce((sum, l) => sum + l.invoiceAmountINR, 0);
    const cashRealized = ownerLines.filter((l) => l.status === "Paid").reduce((sum, l) => sum + l.invoiceAmountINR, 0);
    assert.equal(invoiceRaised, 60000, "40000 (Raised) + 20000 (Paid); the 999999 Cancelled line must be excluded");
    assert.equal(cashRealized, 20000, "only the Paid line counts toward Cash Realized");
    assert.equal(invoiceRaised - cashRealized, 40000, "Outstanding = Invoice Raised - Cash Realized");

    const otherProjectLines = otherBody.data.items.filter((l) => l.projectId === otherProject.id);
    const otherCashRealized = otherProjectLines.filter((l) => l.status === "Paid").reduce((sum, l) => sum + l.invoiceAmountINR, 0);
    assert.equal(otherCashRealized, 0, "PartiallyPaid must never invent a partial Cash Realized amount");
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
