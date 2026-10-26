import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * RFQ No. on Projects (Oct 2026): required (trimmed, never blank) on every
 * create — Add Project and Excel import — and never blank when sent on an
 * update. Projects that predate the field keep NULL and can still take
 * partial updates; nothing is invented for them. Isolated fixtures are
 * removed in `finally`.
 */

const TAG = `rfq-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function projectBody(prNo: string, extra: Record<string, unknown> = {}) {
  return {
    poMonth: "2026-10", prCategory: "India", prNo, rfqNo: `RFQ-${prNo}`, client: "RFQ Client", department: "PMO",
    domesticForeign: "Domestic", projectTitle: `RFQ ${prNo}`, workOrderStatus: "Received",
    projectStartDate: "2026-10-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`,
    workOrderDate: "2026-10-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}

const withoutRfq = (body: Record<string, unknown>) => {
  const { rfqNo: _omit, ...rest } = body;
  return rest;
};

test("Project RFQ No.: required on create/import, persisted, never blank on update", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } });
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const addProjectModule = await prisma.module.findUniqueOrThrow({ where: { name: "Add Project" } });
    const user = await prisma.portalUser.create({
      data: {
        fullName: `Rfq Tester`, email: `${TAG}-pm@example.com`, passwordHash: await hashPassword("RfqTest@123"),
        department: "PMO", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: addProjectModule.id }] },
      },
    });
    createdUserIds.push(user.id);
    const token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const api = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${url}${path}`, { method, headers: h, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = (await res.json()) as { data?: Record<string, unknown> & { items?: Array<Record<string, unknown>> }; message?: string };
      return { status: res.status, data: json.data, message: json.message };
    };

    let projectId = "";

    await t.test("1. Add Project with a valid RFQ No. stores it trimmed and returns it", async () => {
      const prNo = `PR-${TAG}-1`;
      const res = await api("POST", "/projects", projectBody(prNo, { rfqNo: "  RFQ/IFL-2026/007-A  " }));
      assert.equal(res.status, 201, res.message);
      projectId = res.data!.id as string;
      assert.equal(res.data!.rfqNo, "RFQ/IFL-2026/007-A");
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).rfqNo, "RFQ/IFL-2026/007-A");
      assert.equal((await api("GET", `/projects/${projectId}`)).data!.rfqNo, "RFQ/IFL-2026/007-A", "reopened value");
    });

    await t.test("2/8. Add Project without RFQ No., or with a blank one, is rejected and creates nothing", async () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ["missing", withoutRfq(projectBody(`PR-${TAG}-2a`))],
        ["empty", projectBody(`PR-${TAG}-2b`, { rfqNo: "" })],
        ["whitespace", projectBody(`PR-${TAG}-2c`, { rfqNo: "   " })],
        ["null", projectBody(`PR-${TAG}-2d`, { rfqNo: null })],
      ];
      for (const [label, body] of cases) {
        const res = await api("POST", "/projects", body);
        assert.equal(res.status, 400, `${label} RFQ No. rejected`);
        assert.match(res.message!, /RFQ No\. is required/, label);
      }
      assert.equal(await prisma.project.count({ where: { prNo: { startsWith: `PR-${TAG}-2` } } }), 0);
    });

    await t.test("3/9. Edit Project updates RFQ No. and leaves every other field unchanged", async () => {
      const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      const res = await api("PATCH", `/projects/${projectId}`, { rfqNo: " RFQ-REVISED-02 " });
      assert.equal(res.status, 200, res.message);
      const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      assert.equal(after.rfqNo, "RFQ-REVISED-02");
      const { rfqNo: _a, updatedAt: _b, ...beforeRest } = before;
      const { rfqNo: _c, updatedAt: _d, ...afterRest } = after;
      assert.deepEqual(afterRest, beforeRest, "no other column changed");

      // A partial update of another field keeps the stored RFQ No.
      assert.equal((await api("PATCH", `/projects/${projectId}`, { projectTitle: `RFQ retitled ${TAG}` })).status, 200);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).rfqNo, "RFQ-REVISED-02");
    });

    await t.test("8. an update can never blank out RFQ No.", async () => {
      for (const rfqNo of ["", "   ", null]) {
        const res = await api("PATCH", `/projects/${projectId}`, { rfqNo });
        assert.equal(res.status, 400, `rfqNo=${JSON.stringify(rfqNo)} rejected`);
        assert.match(res.message!, /RFQ No\./);
      }
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).rfqNo, "RFQ-REVISED-02");
    });

    await t.test("older project without RFQ No.: stays NULL on partial updates, accepts a real value", async () => {
      const legacy = await prisma.project.create({
        data: { ...withoutRfq(projectBody(`PR-${TAG}-L`)), projectStartDate: new Date("2026-10-01"), workOrderDate: new Date("2026-10-01"), createdByUserId: user.id } as never,
      });
      assert.equal(legacy.rfqNo, null);
      assert.equal((await api("GET", `/projects/${legacy.id}`)).data!.rfqNo, null);
      assert.equal((await api("PATCH", `/projects/${legacy.id}`, { remarks: "budget tab save" })).status, 200, "not blocked");
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: legacy.id } })).rfqNo, null, "nothing invented");
      assert.equal((await api("PATCH", `/projects/${legacy.id}`, { rfqNo: "RFQ-LEGACY-9" })).status, 200);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: legacy.id } })).rfqNo, "RFQ-LEGACY-9");
    });

    await t.test("10. Excel import: a row without RFQ No. rejects the whole batch; valid rows store it", async () => {
      const ok = projectBody(`PR-${TAG}-I1`, { rfqNo: "RFQ-IMP-1" });
      const bad = withoutRfq(projectBody(`PR-${TAG}-I2`));
      const rejected = await api("POST", "/projects/import", { projects: [ok, bad] });
      assert.equal(rejected.status, 400);
      assert.match(rejected.message!, /projects\.1\.rfqNo: RFQ No\. is required/);
      assert.equal(await prisma.project.count({ where: { prNo: { startsWith: `PR-${TAG}-I` } } }), 0, "all-or-nothing");

      const blank = await api("POST", "/projects/import", { projects: [projectBody(`PR-${TAG}-I3`, { rfqNo: "  " })] });
      assert.equal(blank.status, 400);

      const accepted = await api("POST", "/projects/import", { projects: [ok, projectBody(`PR-${TAG}-I2`, { rfqNo: " RFQ-IMP-2 " })] });
      assert.equal(accepted.status, 201, accepted.message);
      const rows = await prisma.project.findMany({ where: { prNo: { startsWith: `PR-${TAG}-I` } }, orderBy: { prNo: "asc" } });
      assert.deepEqual(rows.map((r) => r.rfqNo), ["RFQ-IMP-1", "RFQ-IMP-2"]);
    });
  } finally {
    await close();
    await prisma.project.deleteMany({ where: { prNo: { startsWith: `PR-${TAG}` } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
