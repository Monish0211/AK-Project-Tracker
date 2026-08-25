import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P13 — Milestone delete / invoice-line race. deleteMilestoneItem()'s
 * "is this milestone referenced by any InvoiceLine" check and its actual
 * delete were two separate, unguarded round trips (no transaction, no
 * advisory lock — InvoiceLine.milestoneId is a plain, unenforced string
 * with no DB FK to catch this after the fact). This proves a concurrent
 * DELETE /milestones/:id and POST /quantity/:quantityItemId/invoice-lines
 * (referencing that milestone) can no longer both succeed and leave an
 * orphaned InvoiceLine pointing at a milestone that no longer exists.
 */

const TAG = `ms-del-race-p13-${Date.now()}`;

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

test("DELETE /milestones/:id racing POST invoice-lines referencing it never leaves an orphaned InvoiceLine", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole, invoicesModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    ]);
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("MsDelRaceTest@123");

    const user = await prisma.portalUser.create({
      data: {
        fullName: "Milestone Delete Race User",
        email: `${TAG}@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: invoicesModule.id }, { moduleId: projectsModule.id }] },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: engineerRole.name });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `PR-${TAG}`,
        client: "Milestone Delete Race Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Milestone delete / invoice race regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: user.id,
      },
    });
    createdProjectIds.push(project.id);

    // Repeat the race N times with a FRESH milestone + several quantity
    // items each round, firing ONE delete concurrently against MANY create
    // attempts (each a distinct invoiceNo/quantityItem, so P3's own
    // duplicate-milestone-billing lock never itself serializes them against
    // each other) — matching the same "many concurrent requests against one
    // shared target" shape already proven to reliably surface this class of
    // race in milestone.concurrency.http.test.ts's own 100%-cap test, rather
        // than a single 1-vs-1 pair (whose narrow interleaving window a fast
    // local Postgres round-trip can coincidentally miss even when
    // genuinely unprotected).
    const ROUNDS = 8;
    const CREATES_PER_ROUND = 8;
    for (let round = 0; round < ROUNDS; round++) {
      const milestone = await prisma.paymentMilestone.create({
        data: { projectId: project.id, milestoneName: `P13 Race Milestone ${round}`, paymentPercentage: 5 },
      });
      const quantityItems = await Promise.all(
        Array.from({ length: CREATES_PER_ROUND }, (_, i) =>
          prisma.quantityItem.create({
            data: {
              projectId: project.id,
              description: `P13 race activity ${round}-${i}`,
              woQty: 1,
              uom: "LUMP SUM",
              unitRate: 100_000,
              exchangeRate: 1,
              unitRateINR: 100_000,
              woValue: 100_000,
            },
          })
        )
      );

      const deleteReq = fetch(`${url}/milestones/${milestone.id}`, { method: "DELETE", headers });
      const createReqs = quantityItems.map((qi, i) =>
        fetch(`${url}/quantity/${qi.id}/invoice-lines`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            invoiceNo: `${TAG}-${round}-${i}`,
            invoiceDate: new Date("2026-02-01").toISOString(),
            milestoneId: milestone.id,
            quantityBilled: 0,
            invoiceAmountINR: 10_000,
            status: "Raised",
          }),
        })
      );

      const [deleteRes, ...createResults] = await Promise.all([deleteReq, ...createReqs]);

      // The DEFINITIVE, timing-independent invariant: after every request
      // has fully settled, it must NEVER be the case that both "the
      // milestone is gone" AND "a non-Cancelled InvoiceLine still
      // references it" are simultaneously true.
      const milestoneStillExists = await prisma.paymentMilestone.findUnique({ where: { id: milestone.id } });
      const referencingLines = await prisma.invoiceLine.count({
        where: { milestoneId: milestone.id, status: { not: "Cancelled" } },
      });

      if (!milestoneStillExists) {
        assert.equal(
          referencingLines,
          0,
          `round ${round}: milestone was deleted but ${referencingLines} InvoiceLine row(s) still reference it — orphaned financial record`
        );
        assert.equal(deleteRes.status, 200, `round ${round}: the delete that actually won must report success`);
        for (const createRes of createResults) {
          assert.equal(createRes.status, 400, `round ${round}: once the milestone is gone, every create referencing it must be rejected, never silently succeed`);
        }
      } else {
        // Milestone survived — at least one create won the race; the
        // delete must have been rejected (409), never a silent no-op.
        assert.equal(deleteRes.status, 409, `round ${round}: if the milestone still exists, its delete attempt must have been cleanly rejected`);
      }

      // Every response must be a clean, handled outcome — never a raw 500.
      assert.ok([200, 409].includes(deleteRes.status), `round ${round}: DELETE must resolve to 200 or 409, got ${deleteRes.status}`);
      for (const createRes of createResults) {
        assert.ok([201, 400].includes(createRes.status), `round ${round}: POST must resolve to 201 or 400, got ${createRes.status}`);
      }

      // Track any created lines for cleanup.
      for (const createRes of createResults) {
        if (createRes.status === 201) {
          const createdJson = (await createRes.json()) as { data: { id: string } };
          await prisma.invoiceLine.deleteMany({ where: { id: createdJson.data.id } });
        }
      }
    }
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
