import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * "Add Project" Module Access (Oct 2026) — end-to-end over real HTTP, a real Postgres database and real JWTs.
 * Direct project creation (POST /projects, POST /projects/import) needs BOTH "Projects" and "Add Project", on top of the
 * existing Read Only restriction, with no Administrator role bypass. Viewing and editing existing projects must NOT depend on
 * "Add Project", and a PR Request approval (which creates its Project through the service layer) must not need it either.
 */

const TAG = `addproj-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

function projectBody(prNo: string, title = "Add Project permission test") {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "Permission Test Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: title,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01").toISOString(),
    rfqNo: "RFQ-TEST",
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

test("Add Project permission — direct creation and import need Projects AND Add Project; existing projects stay independent", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdPrNos: string[] = [];

  try {
    const [adminRole, pmRole, readOnlyRole, projectsModule, addProjectModule, prRequestModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Project Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Read Only" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Add Project" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
    ]);
    const passwordHash = await hashPassword("AddProjectTest@123");

    async function createUser(label: string, role: { id: string; name: string }, moduleIds: string[]) {
      const user = await prisma.portalUser.create({
        data: {
          fullName: `Add Project Test ${label}`,
          email: `${TAG}-${label}@example.com`,
          passwordHash,
          department: "PMO",
          roleId: role.id,
          forcePasswordChange: false,
          moduleAccess: { create: moduleIds.map((moduleId) => ({ moduleId })) },
        },
      });
      createdUserIds.push(user.id);
      return { ...user, token: tokenFor({ ...user, roleName: role.name }) };
    }

    const P = projectsModule.id;
    const A = addProjectModule.id;
    const R = prRequestModule.id;
    const both = await createUser("both", pmRole, [P, A]);
    const projectsOnly = await createUser("projects-only", pmRole, [P]);
    const addOnly = await createUser("add-only", pmRole, [A]);
    const prRequestOnly = await createUser("prreq-only", pmRole, [P, R]);
    const none = await createUser("none", pmRole, []);
    const readOnly = await createUser("readonly", readOnlyRole, [P, A]);
    // No Administrator bypass: an Administrator with only "Projects" is refused exactly like anyone else.
    const adminProjectsOnly = await createUser("admin-projects-only", adminRole, [P]);
    const adminBoth = await createUser("admin-both", adminRole, [P, A]);

    const post = (path: string, token: string, body: unknown) =>
      fetch(`${url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

    let n = 0;
    const nextPrNo = () => {
      const prNo = `PR-${TAG}-${++n}`;
      createdPrNos.push(prNo);
      return prNo;
    };

    // ---- POST /projects ----
    const denied: [string, { token: string }][] = [
      ["Projects without Add Project", projectsOnly],
      ["Add Project without Projects", addOnly],
      ["PR Request (not Add Project) — the two permissions never imply each other", prRequestOnly],
      ["no modules", none],
      ["Administrator with Projects only (no role bypass)", adminProjectsOnly],
      ["Read Only holding both modules", readOnly],
    ];
    for (const [label, who] of denied) {
      const res = await post("/projects", who.token, projectBody(nextPrNo()));
      assert.equal(res.status, 403, `POST /projects must be refused for: ${label}`);
    }
    for (const prNo of createdPrNos) {
      assert.equal(await prisma.project.count({ where: { prNo } }), 0, `a refused create must not leave a Project (${prNo})`);
    }

    const createdRes = await post("/projects", both.token, projectBody(nextPrNo(), "Created by Projects + Add Project"));
    assert.equal(createdRes.status, 201, "Projects + Add Project may create a project");
    const created = ((await createdRes.json()) as ApiEnvelope<{ id: string }>).data!;
    const adminCreateRes = await post("/projects", adminBoth.token, projectBody(nextPrNo()));
    assert.equal(adminCreateRes.status, 201, "Administrator holding both modules may create");

    // ---- POST /projects/import ----
    for (const [label, who] of denied) {
      const res = await post("/projects/import", who.token, { projects: [projectBody(nextPrNo())] });
      assert.equal(res.status, 403, `POST /projects/import must be refused for: ${label}`);
    }
    const importPrNo = nextPrNo();
    const importRes = await post("/projects/import", both.token, { projects: [projectBody(importPrNo)] });
    assert.equal(importRes.status, 201, `import with Projects + Add Project: ${importRes.status}`);
    assert.equal(await prisma.project.count({ where: { prNo: importPrNo } }), 1);

    // ---- existing projects stay independent of Add Project ----
    // `both` created `created`; now REVOKE Add Project and prove viewing/editing their own project still works.
    await prisma.userModuleAccess.deleteMany({ where: { userId: both.id, moduleId: A } });
    const listRes = await fetch(`${url}/projects?pageSize=5`, { headers: { Authorization: `Bearer ${both.token}` } });
    assert.equal(listRes.status, 200, "Project Repository stays readable without Add Project");
    const viewRes = await fetch(`${url}/projects/${created.id}`, { headers: { Authorization: `Bearer ${both.token}` } });
    assert.equal(viewRes.status, 200, "Project details stay viewable without Add Project");
    const editRes = await fetch(`${url}/projects/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${both.token}` },
      body: JSON.stringify({ projectTitle: "Edited without Add Project" }),
    });
    assert.equal(editRes.status, 200, "Editing an existing project does not need Add Project");
    const stillDenied = await post("/projects", both.token, projectBody(nextPrNo()));
    assert.equal(stillDenied.status, 403, "…but creating a new one now does");
  } finally {
    await prisma.project.deleteMany({ where: { prNo: { in: createdPrNos } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
