import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `note-attr-${Date.now()}`;

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

test("POST /projects/:projectId/notes always attributes createdBy to the authenticated caller, never the request body", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("NoteAttrTest@123");

    const realUser = await prisma.portalUser.create({
      data: {
        fullName: "Note Attribution Real User",
        email: `${TAG}-real@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(realUser.id);
    const token = tokenFor({ ...realUser, roleName: engineerRole.name });

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-01",
        prCategory: "India",
        prNo: `${TAG}-A`,
        client: "Note Attribution Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Note attribution regression",
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

    // A malicious/spoofed createdBy in the body must be completely ignored
    // — the stored value must be the authenticated caller's real name.
    const res = await fetch(`${url}/projects/${project.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "A real note.", createdBy: "Impersonated Administrator" }),
    });
    assert.equal(res.status, 201);
    const json = (await res.json()) as { data: { createdBy: string; message: string } };
    assert.equal(json.data.createdBy, "Note Attribution Real User");
    assert.notEqual(json.data.createdBy, "Impersonated Administrator");

    // Confirmed directly against the database too, not just the response.
    const stored = await prisma.projectNote.findFirst({ where: { projectId: project.id } });
    assert.equal(stored?.createdBy, "Note Attribution Real User");

    // Malformed input (empty message) is still rejected with 400 — the new
    // validator doesn't accidentally loosen anything else.
    const empty = await fetch(`${url}/projects/${project.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "   " }),
    });
    assert.equal(empty.status, 400);
  } finally {
    await prisma.projectNote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
