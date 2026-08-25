import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2 — Invoice amount write-time financial authority: invoiceAmountINR was
 * previously accepted verbatim from the client on create/update, with no
 * ceiling against the parent QuantityItem's Work Order Value (woValue). The
 * Dashboard's Math.min() clamp only ever affected what was DISPLAYED, never
 * what could be WRITTEN. This proves the server now derives/enforces the
 * real ceiling at write time, on both create and update, without weakening
 * the pre-existing duplicate-PR/ownership protections, and without capping
 * the legacy-migration Ingest path (a deliberate exemption — see the final
 * report's Remaining Decisions section — mirroring the already-documented
 * milestone-ingest precedent).
 *
 * P3 — Milestone double-billing race: the "already billed" duplicate-
 * milestone check was a plain check-then-insert with no transaction/lock.
 * This proves genuinely concurrent requests against the same Lump-Sum
 * milestone (different invoiceNo) can no longer both succeed.
 */

const TAG = `inv-fin-auth-${Date.now()}`;

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

interface LineResponse {
  success: boolean;
  data?: { id: string; invoiceAmountINR: number };
  message?: string;
}

test("P2/P3 — invoice financial authority and milestone double-billing race", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, engineerRole, invoicesModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    ]);
    const passwordHash = await hashPassword("InvFinAuthTest@123");

    const [owner, otherUser, adminUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "Inv Fin Auth Owner",
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
          fullName: "Inv Fin Auth Other",
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
          fullName: "Inv Fin Auth Admin",
          email: `${TAG}-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: invoicesModule.id } },
        },
      }),
    ]);
    createdUserIds.push(owner.id, otherUser.id, adminUser.id);

    const ownerToken = tokenFor({ ...owner, roleName: engineerRole.name });
    const otherToken = tokenFor({ ...otherUser, roleName: engineerRole.name });
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `PR-${TAG}`,
        client: "Invoice Financial Authority Regression Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Invoice financial authority + milestone race regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: owner.id,
      },
    });
    createdProjectIds.push(project.id);

    const makeQuantityItem = (woValue: number) =>
      prisma.quantityItem.create({
        data: {
          projectId: project.id,
          description: "Financial authority test activity",
          woQty: 1,
          uom: "LUMP SUM",
          unitRate: woValue,
          exchangeRate: 1,
          unitRateINR: woValue,
          woValue,
        },
      });

    const createLine = (quantityItemId: string, body: Record<string, unknown>, token: string) =>
      fetch(`${url}/quantity/${quantityItemId}/invoice-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

    const updateLine = (lineId: string, body: Record<string, unknown>, token: string) =>
      fetch(`${url}/invoice-lines/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

    const baseLineBody = (overrides: Record<string, unknown>) => ({
      invoiceNo: `${TAG}-INV`,
      invoiceDate: new Date("2026-02-01").toISOString(),
      quantityBilled: 0,
      invoiceAmountINR: 0,
      status: "Raised",
      ...overrides,
    });

    // ---- A. valid invoice (well within woValue) ----
    const qtyA = await makeQuantityItem(100_000);
    const resA = await createLine(qtyA.id, baseLineBody({ invoiceNo: `${TAG}-A`, invoiceAmountINR: 40_000 }), ownerToken);
    assert.equal(resA.status, 201, `A failed: ${JSON.stringify(await resA.clone().json())}`);

    // ---- B. zero invoice (allowed by the schema's own min(0) rule) ----
    const qtyB = await makeQuantityItem(100_000);
    const resB = await createLine(qtyB.id, baseLineBody({ invoiceNo: `${TAG}-B`, invoiceAmountINR: 0 }), ownerToken);
    assert.equal(resB.status, 201, "a zero-amount invoice line must still be creatable");

    // ---- C. partial invoice, then D. a second line reaching EXACTLY the
    // remaining amount ----
    const qtyCD = await makeQuantityItem(100_000);
    const resC = await createLine(qtyCD.id, baseLineBody({ invoiceNo: `${TAG}-C`, invoiceAmountINR: 60_000 }), ownerToken);
    assert.equal(resC.status, 201, "C (partial invoice) must succeed");
    const resD = await createLine(qtyCD.id, baseLineBody({ invoiceNo: `${TAG}-D`, invoiceAmountINR: 40_000 }), ownerToken);
    assert.equal(resD.status, 201, "D (exact remaining amount, cumulative = woValue) must succeed");

    // ---- E. overbilling rejected (a single line beyond woValue) ----
    const qtyE = await makeQuantityItem(100_000);
    const resE = await createLine(qtyE.id, baseLineBody({ invoiceNo: `${TAG}-E`, invoiceAmountINR: 150_000 }), ownerToken);
    assert.equal(resE.status, 400, "E (single line over woValue) must be rejected");
    const linesAfterE = await prisma.invoiceLine.findMany({ where: { quantityItemId: qtyE.id } });
    assert.equal(linesAfterE.length, 0, "a rejected overbilling attempt must leave zero rows behind");

    // ---- F. malicious client amount rejected (exact spec example: a
    // wildly manipulated invoiceAmountINR far beyond any real value) ----
    const qtyF = await makeQuantityItem(1_000);
    const resF = await createLine(qtyF.id, baseLineBody({ invoiceNo: `${TAG}-F`, invoiceAmountINR: 999_999_999 }), ownerToken);
    assert.equal(resF.status, 400, "F (malicious client-supplied amount) must be rejected");

    // ---- G. concurrent billing: 20 concurrent creates of 10,000 each
    // against a 100,000 woValue activity — at most 10 may legitimately land
    // (10 x 10,000 = 100,000); the DB's final state must never exceed woValue
    // regardless of how many individual requests raced. ----
    const qtyG = await makeQuantityItem(100_000);
    const concurrentResults = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createLine(qtyG.id, baseLineBody({ invoiceNo: `${TAG}-G-${i}`, invoiceAmountINR: 10_000 }), ownerToken)
      )
    );
    const succeeded = concurrentResults.filter((r) => r.status === 201).length;
    const rejected = concurrentResults.filter((r) => r.status === 400).length;
    assert.equal(succeeded + rejected, 20, "every concurrent request must resolve to either success or a clean 400 — never a raw 500");
    assert.ok(succeeded <= 10, `at most 10 of the 20 concurrent 10,000 lines may succeed against a 100,000 woValue — got ${succeeded}`);
    const finalSumG = await prisma.invoiceLine.aggregate({
      where: { quantityItemId: qtyG.id, status: { not: "Cancelled" } },
      _sum: { invoiceAmountINR: true },
    });
    assert.ok(
      (finalSumG._sum.invoiceAmountINR ?? 0) <= 100_000,
      `final DB total must never exceed woValue — got ${finalSumG._sum.invoiceAmountINR}`
    );

    // ---- H. normal update: increasing an existing line's amount within
    // the remaining room succeeds; increasing it beyond the ceiling is
    // rejected and leaves the row unchanged. ----
    const qtyH = await makeQuantityItem(100_000);
    const resHCreate = await createLine(qtyH.id, baseLineBody({ invoiceNo: `${TAG}-H`, invoiceAmountINR: 50_000 }), ownerToken);
    assert.equal(resHCreate.status, 201);
    const lineH = ((await resHCreate.json()) as LineResponse).data!;

    const resHGoodUpdate = await updateLine(lineH.id, { invoiceAmountINR: 90_000 }, ownerToken);
    assert.equal(resHGoodUpdate.status, 200, "H: increasing to still-within-limit must succeed");

    const resHBadUpdate = await updateLine(lineH.id, { invoiceAmountINR: 150_000 }, ownerToken);
    assert.equal(resHBadUpdate.status, 400, "H: increasing beyond the ceiling must be rejected");
    const lineHAfter = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: lineH.id } });
    assert.equal(lineHAfter.invoiceAmountINR, 90_000, "a rejected update must leave the line's amount unchanged (no partial apply)");

    // ---- I. authorization: a user with Invoices module access but who
    // does NOT own this project must be rejected before any financial
    // check even runs. ----
    const qtyI = await makeQuantityItem(100_000);
    const resI = await createLine(qtyI.id, baseLineBody({ invoiceNo: `${TAG}-I`, invoiceAmountINR: 10_000 }), otherToken);
    assert.equal(resI.status, 403, "an unauthorized (non-owning) user must be rejected");
    const resIAdmin = await createLine(qtyI.id, baseLineBody({ invoiceNo: `${TAG}-I-admin`, invoiceAmountINR: 10_000 }), adminToken);
    assert.equal(resIAdmin.status, 201, "Administrator is unaffected by project ownership");

    // ---- J/K. Ingest path: deliberately EXEMPT from this cap (mirrors the
    // already-documented milestone-ingest precedent) — legacy/historical
    // data being migrated in may already exceed today's clean ceiling.
    // There is only one ingest endpoint for invoice lines (no separate
    // "legacy" ingest), so this single case covers both J and K. ----
    const qtyJ = await makeQuantityItem(10_000);
    const ingestRes = await fetch(`${url}/projects/${project.id}/invoice-items/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        lines: [
          {
            id: crypto.randomUUID(),
            quantityItemId: qtyJ.id,
            invoiceNo: `${TAG}-J-INGEST`,
            invoiceDate: new Date("2026-02-01").toISOString(),
            quantityBilled: 0,
            unitPriceINR: 10_000,
            calculatedAmountINR: 999_999,
            invoiceAmountINR: 999_999,
            commercialAdjustmentINR: 0,
            status: "Raised",
            createdBy: "Legacy Migration",
          },
        ],
      }),
    });
    assert.equal(ingestRes.status, 201, "ingest must remain exempt from the new financial-authority cap (documented decision)");

    // =========================================================
    // P3 — Milestone double-billing race
    // =========================================================
    const milestone = await prisma.paymentMilestone.create({
      data: { projectId: project.id, milestoneName: "P3 Race Milestone", paymentPercentage: 50 },
    });
    const qtyMilestoneBase = () => makeQuantityItem(100_000);

    // ---- Sequential: a second, different-invoiceNo line against the SAME
    // Lump-Sum milestone is rejected; the SAME invoiceNo (editing/adding
    // within the same cycle) is not a conflict — pre-existing behavior,
    // unaffected by the concurrency fix. ----
    const qtySeq = await qtyMilestoneBase();
    const seqFirst = await createLine(
      qtySeq.id,
      baseLineBody({ invoiceNo: `${TAG}-SEQ-1`, milestoneId: milestone.id, quantityBilled: 0, invoiceAmountINR: 10_000 }),
      ownerToken
    );
    assert.equal(seqFirst.status, 201);

    const seqDifferentInvoiceNo = await createLine(
      qtySeq.id,
      baseLineBody({ invoiceNo: `${TAG}-SEQ-2`, milestoneId: milestone.id, quantityBilled: 0, invoiceAmountINR: 5_000 }),
      ownerToken
    );
    assert.equal(seqDifferentInvoiceNo.status, 409, "billing the same milestone under a DIFFERENT invoiceNo must be rejected");

    // A different quantityItem (a fresh Lump-Sum "activity") billing the
    // SAME milestone under the SAME invoiceNo as the existing line is the
    // normal "several POSTs, one per activity, all sharing one invoiceNo"
    // Lump-Sum flow — must NOT be rejected.
    const qtySeq2 = await qtyMilestoneBase();
    const seqSameInvoiceNoOtherActivity = await createLine(
      qtySeq2.id,
      baseLineBody({ invoiceNo: `${TAG}-SEQ-1`, milestoneId: milestone.id, quantityBilled: 0, invoiceAmountINR: 5_000 }),
      ownerToken
    );
    assert.equal(
      seqSameInvoiceNoOtherActivity.status,
      201,
      "the SAME invoiceNo billing the SAME milestone from a different activity is the normal multi-activity Lump-Sum flow, not a conflict"
    );

    // ---- Concurrent: 15 concurrent creates against the SAME fresh
    // milestone, each with its OWN distinct invoiceNo — exactly ONE must
    // succeed, the other 14 must be cleanly rejected (409), and the final
    // DB state must show exactly one non-Cancelled line for this milestone. ----
    const raceMilestone = await prisma.paymentMilestone.create({
      data: { projectId: project.id, milestoneName: "P3 Concurrent Race Milestone", paymentPercentage: 30 },
    });
    const qtyRace = await qtyMilestoneBase();
    const raceResults = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        createLine(
          qtyRace.id,
          baseLineBody({ invoiceNo: `${TAG}-RACE-${i}`, milestoneId: raceMilestone.id, quantityBilled: 0, invoiceAmountINR: 1_000 }),
          ownerToken
        )
      )
    );
    const raceSucceeded = raceResults.filter((r) => r.status === 201).length;
    const raceRejected = raceResults.filter((r) => r.status === 409).length;
    assert.equal(raceSucceeded, 1, `exactly one concurrent request billing the same milestone must succeed — got ${raceSucceeded}`);
    assert.equal(raceRejected, 14, `the other 14 must be cleanly rejected as a conflict — got ${raceRejected}`);
    const finalMilestoneLines = await prisma.invoiceLine.count({
      where: { milestoneId: raceMilestone.id, status: { not: "Cancelled" } },
    });
    assert.equal(finalMilestoneLines, 1, "final DB state must show exactly one non-Cancelled line for the raced milestone");
  } finally {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: createdProjectIds } } } });
    await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
