import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { findInvoiceLinesForProjects } from "./repository/dashboard.repository.js";
import { hardDeleteProject } from "../projects/repository/project.repository.js";

/**
 * Dashboard reliability bug (found during P2-13 stress testing, NOT part of
 * the P2 review — a separate, newly-discovered production issue).
 *
 * Root cause (proven by direct Prisma query-log inspection, see
 * dashboard.repository.ts's own comment on findInvoiceLinesForProjects()):
 * the old query nested a to-one `quantityItem: { select: { projectId: true } }`
 * select inside `invoiceLine.findMany()`. With this codebase's driver-adapter
 * Prisma setup (@prisma/adapter-pg, no Rust query engine —
 * relationLoadStrategy: "join" isn't available), that nested to-one select
 * is NOT one atomic SQL JOIN — it's two separate round trips (InvoiceLine
 * first, then a follow-up QuantityItem-by-id lookup). InvoiceLine.quantityItem
 * is schema-guaranteed non-null at rest (onDelete: Restrict), so this was
 * never a data-integrity problem — it's a read-consistency gap: if
 * DELETE /projects/:id/permanent (hardDeleteProject(), an atomic
 * $transaction deleting the project's InvoiceLines then cascade-deleting its
 * QuantityItems) commits between those two round trips, the first query can
 * still return an InvoiceLine row from a moment ago while the second finds
 * no QuantityItem for it — Prisma fills in `null`, and the old code crashed
 * reading `.projectId` off it.
 *
 * The fix restructures the query to anchor on QuantityItem instead (whose
 * projectId is its own direct, always-present scalar column, never a
 * separately-loaded relation) — structurally eliminating the null
 * dereference rather than defensively handling it.
 */

const TAG = `dash-invln-${Date.now()}`;

function projectPayload(prNo: string): Parameters<typeof prisma.project.create>[0]["data"] {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "Dashboard InvoiceLine Null Probe",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Dashboard invoiceLine null probe",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

test("findInvoiceLinesForProjects: normal multi-project/multi-item/multi-line correctness is unchanged", async () => {
  const createdProjectIds: string[] = [];
  try {
    const [projectA, projectB] = await Promise.all([
      prisma.project.create({ data: projectPayload(`${TAG}-A`) }),
      prisma.project.create({ data: projectPayload(`${TAG}-B`) }),
    ]);
    createdProjectIds.push(projectA.id, projectB.id);

    const [qtyA1, qtyA2, qtyB1] = await Promise.all([
      prisma.quantityItem.create({
        data: { projectId: projectA.id, description: "A1", woQty: 1, uom: "LOT", currency: "INR", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 1000 },
      }),
      prisma.quantityItem.create({
        data: { projectId: projectA.id, description: "A2", woQty: 1, uom: "LOT", currency: "INR", unitRate: 2000, exchangeRate: 1, unitRateINR: 2000, woValue: 2000 },
      }),
      prisma.quantityItem.create({
        data: { projectId: projectB.id, description: "B1", woQty: 1, uom: "LOT", currency: "INR", unitRate: 3000, exchangeRate: 1, unitRateINR: 3000, woValue: 3000 },
      }),
    ]);

    const userForAttribution = await prisma.portalUser.findFirstOrThrow({ select: { id: true } });

    await Promise.all([
      // A1 gets two invoice lines (proves multiple lines per item work).
      prisma.invoiceLine.create({
        data: { quantityItemId: qtyA1.id, invoiceNo: `${TAG}-A1-1`, invoiceDate: new Date("2026-02-01"), quantityBilled: 1, invoiceAmountINR: 500, status: "Raised", createdBy: userForAttribution.id },
      }),
      prisma.invoiceLine.create({
        data: { quantityItemId: qtyA1.id, invoiceNo: `${TAG}-A1-2`, invoiceDate: new Date("2026-03-01"), quantityBilled: 1, invoiceAmountINR: 500, status: "Cancelled", createdBy: userForAttribution.id },
      }),
      // A2 gets one.
      prisma.invoiceLine.create({
        data: { quantityItemId: qtyA2.id, invoiceNo: `${TAG}-A2-1`, invoiceDate: new Date("2026-02-15"), quantityBilled: 1, invoiceAmountINR: 900, status: "Paid", createdBy: userForAttribution.id },
      }),
      // B1 gets one — different project, must be attributed correctly.
      prisma.invoiceLine.create({
        data: { quantityItemId: qtyB1.id, invoiceNo: `${TAG}-B1-1`, invoiceDate: new Date("2026-04-01"), quantityBilled: 1, invoiceAmountINR: 1200, status: "Raised", createdBy: userForAttribution.id },
      }),
    ]);

    const rows = await findInvoiceLinesForProjects([projectA.id, projectB.id]);

    const byInvoiceNo = new Map(rows.map((r) => [r.invoiceNo, r]));
    assert.equal(rows.length, 4);
    assert.equal(byInvoiceNo.get(`${TAG}-A1-1`)?.projectId, projectA.id);
    assert.equal(byInvoiceNo.get(`${TAG}-A1-2`)?.projectId, projectA.id);
    assert.equal(byInvoiceNo.get(`${TAG}-A2-1`)?.projectId, projectA.id);
    assert.equal(byInvoiceNo.get(`${TAG}-B1-1`)?.projectId, projectB.id);
    assert.equal(byInvoiceNo.get(`${TAG}-A2-1`)?.invoiceAmountINR, 900);
    assert.equal(byInvoiceNo.get(`${TAG}-B1-1`)?.status, "Raised");

    // Filtering by only projectA must exclude projectB's line.
    const onlyA = await findInvoiceLinesForProjects([projectA.id]);
    assert.equal(onlyA.length, 3);
    assert.ok(onlyA.every((r) => r.projectId === projectA.id));

    // Empty input short-circuits to an empty array (unchanged contract).
    assert.deepEqual(await findInvoiceLinesForProjects([]), []);
  } finally {
    if (createdProjectIds.length > 0) {
      // hardDeleteProject already deletes InvoiceLines + the project
      // (cascading QuantityItems) — no separate cleanup needed.
      for (const id of createdProjectIds) {
        await prisma.project.findUnique({ where: { id } }).then(async (p) => {
          if (p) await hardDeleteProject(id);
        });
      }
    }
  }
});

test("findInvoiceLinesForProjects: survives DELETE /projects/:id/permanent racing a concurrent read (no crash)", async () => {
  // Reliably reproduces the original crash: firing read+delete pairs ONE AT
  // A TIME (Promise.all per pair, sequential across iterations) essentially
  // never lands the race — the gap between the old code's two internal SQL
  // statements is on the order of microseconds, far shorter than a single
  // opposing delete transaction takes to run. Firing MANY pairs fully
  // concurrently (Promise.allSettled across all of them at once) creates
  // genuine connection-pool contention/interleaving that reliably lands the
  // race — confirmed empirically: 21/30 crashes against the pre-fix code
  // with this exact pattern, 0/30 after the fix, across repeated runs.
  const N = 30;
  const userForAttribution = await prisma.portalUser.findFirstOrThrow({ select: { id: true } });
  const projects: { id: string }[] = [];

  for (let i = 0; i < N; i++) {
    const prNo = `${TAG}-race-${i}`;
    const project = await prisma.project.create({ data: projectPayload(prNo) });
    const qty = await prisma.quantityItem.create({
      data: { projectId: project.id, description: "race", woQty: 1, uom: "LOT", currency: "INR", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: 100 },
    });
    await prisma.invoiceLine.create({
      data: { quantityItemId: qty.id, invoiceNo: `${prNo}-INV`, invoiceDate: new Date("2026-02-01"), quantityBilled: 1, invoiceAmountINR: 100, status: "Raised", createdBy: userForAttribution.id },
    });
    projects.push(project);
  }

  let crashCount = 0;
  const lastMessages: string[] = [];
  const results = await Promise.allSettled(
    projects.flatMap((p) => [findInvoiceLinesForProjects([p.id]), hardDeleteProject(p.id)])
  );
  for (const r of results) {
    if (r.status === "rejected") {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (message.includes("reading 'projectId'")) {
        crashCount++;
        lastMessages.push(message);
      }
      // Any other rejection (e.g. an FK-restrict error from the delete
      // losing its own race against a still-in-flight read) is a separate,
      // acceptable outcome here — not the bug under test. Cleanup below
      // still runs for every project regardless of which promises rejected.
    }
  }

  // Cleanup: exact-ID, regardless of which projects the delete already removed.
  for (const p of projects) {
    const stillExists = await prisma.project.findUnique({ where: { id: p.id } });
    if (stillExists) {
      await hardDeleteProject(p.id).catch(() => undefined);
    }
  }

  assert.equal(
    crashCount,
    0,
    `findInvoiceLinesForProjects crashed with the null-projectId TypeError ${crashCount}/${N} times. Example: ${lastMessages[0]}`
  );
});
