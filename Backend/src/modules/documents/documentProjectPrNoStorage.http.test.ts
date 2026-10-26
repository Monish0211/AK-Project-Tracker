import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { env } from "../../shared/utils/env.js";
import { repointDocumentsToProject } from "./repository/document.repository.js";

/**
 * PR-number-based Project document storage (Oct 2026) — end-to-end over
 * real HTTP, real Postgres, and real (local test-storage-directory) file
 * I/O. Covers the physical layout change only: Project documents now live
 * under <storageDir>/<prNo>/<uuid> instead of flat <storageDir>/<uuid>.
 * PR Request and Customer documents are asserted to remain flat/unchanged.
 * document.http.test.ts and customerGst.http.test.ts already cover the
 * pre-existing upload/list/download/delete/authorization/denylist behavior
 * end-to-end; this file only adds coverage for the new physical-path
 * concern layered on top of that unchanged behavior.
 */

const TAG = `prfolder-${Date.now()}`;
const storageDir = path.resolve(env.DOCUMENT_STORAGE_PATH);

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

function buildProjectData(prNo: string, projectTitle: string) {
  return {
    poMonth: "January 2026",
    prCategory: "India",
    prNo,
    client: "Test Client Pvt Ltd",
    department: "PMO",
    domesticForeign: "Domestic",
    projectTitle,
    workOrderStatus: "Received",
    projectStartDate: "2026-01-01",
    projectStatus: "Not Started",
    workOrderNumber: `WO-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    workOrderDate: "2026-01-01",
    rfqNo: "RFQ-TEST",
    eicName: "Test EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "Test Coordinator",
  };
}

function pdfFile(name = "Work Order.pdf", marker = "%PDF-1.4"): File {
  return new File([new TextEncoder().encode(marker)], name, { type: "application/pdf" });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true }).catch(() => {});
}

async function setup(label: string) {
  const { url, close } = await listen();
  const [administratorRole, engineerRole, projectsModule, customerModule, approvalsModule, addProjectModule, prRequestModule] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Customer Master" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Add Project" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
  ]);
  const passwordHash = await hashPassword("PrFolderTest@123");
  const owner = await prisma.portalUser.create({
    data: {
      fullName: `PR Folder Test ${label}`,
      email: `${TAG}-${label.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      passwordHash,
      department: "PMO",
      roleId: engineerRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: customerModule.id }, { moduleId: approvalsModule.id }, { moduleId: addProjectModule.id }, { moduleId: prRequestModule.id }] },
    },
  });
  const admin = await prisma.portalUser.create({
    data: {
      fullName: `PR Folder Test Admin ${label}`,
      email: `${TAG}-${label.toLowerCase().replace(/\s+/g, "-")}-admin@example.com`,
      passwordHash,
      department: "PMO",
      roleId: administratorRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: customerModule.id }, { moduleId: approvalsModule.id }, { moduleId: addProjectModule.id }, { moduleId: prRequestModule.id }] },
    },
  });
  return {
    url,
    close,
    ownerId: owner.id,
    ownerToken: tokenFor({ ...owner, roleName: engineerRole.name }),
    adminToken: tokenFor({ ...admin, roleName: administratorRole.name }),
    userIds: [owner.id, admin.id],
  };
}

async function cleanup(ctx: { url: string; close: () => Promise<void>; userIds: string[] }, projectIds: string[], customerIds: string[]) {
  if (projectIds.length) await prisma.document.deleteMany({ where: { projectId: { in: projectIds } } });
  if (customerIds.length) await prisma.document.deleteMany({ where: { customerId: { in: customerIds } } });
  if (projectIds.length) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (customerIds.length) await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.authAuditLog.deleteMany({ where: { userId: { in: ctx.userIds } } });
  await prisma.portalUser.deleteMany({ where: { id: { in: ctx.userIds } } });
  await ctx.close();
}

test("Project documents physically land under storage/documents/<prNo>/<uuid>, not flat", async () => {
  const ctx = await setup("Basic");
  const projectIds: string[] = [];
  const prNo = `PR-${TAG}-basic`;
  const projectDirsToClean = [path.join(storageDir, prNo)];
  try {
    const projectRes = await fetch(`${ctx.url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify(buildProjectData(prNo, "PR Folder Basic Project")),
    });
    assert.equal(projectRes.status, 201);
    const projectId = ((await projectRes.json()).data as { id: string }).id;
    projectIds.push(projectId);

    const form = new FormData();
    form.append("file", pdfFile());
    const uploadRes = await fetch(`${ctx.url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const doc = (await uploadRes.json()).data as { id: string; fileName: string };
    assert.equal(doc.fileName, "Work Order.pdf", "the original filename remains display metadata");

    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

    // storageKey itself stays a bare UUID — never a compound "<prNo>/<uuid>"
    // string — the folder is derived live from Project.prNo, never persisted.
    assert.doesNotMatch(row.storageKey, /[\\/]/, "storageKey must remain a bare UUID with no path separator");

    const expectedPath = path.join(storageDir, prNo, row.storageKey);
    assert.ok(await pathExists(expectedPath), `physical file must exist at ${expectedPath}`);
    assert.ok(!(await pathExists(path.join(storageDir, row.storageKey))), "the file must NOT also exist flat at the storage root");

    // Original filename never becomes the physical filename.
    assert.ok(!(await pathExists(path.join(storageDir, prNo, "Work Order.pdf"))));

    // Download still serves the correct bytes through the new path.
    const downloadRes = await fetch(`${ctx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${ctx.ownerToken}` } });
    assert.equal(downloadRes.status, 200);
    assert.equal(Buffer.from(new Uint8Array(await downloadRes.arrayBuffer())).toString(), "%PDF-1.4");

    // Delete removes exactly that physical file.
    const deleteRes = await fetch(`${ctx.url}/documents/${doc.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.adminToken}` } });
    assert.equal(deleteRes.status, 200);
    assert.ok(!(await pathExists(expectedPath)), "physical file must be gone after delete");
  } finally {
    for (const dir of projectDirsToClean) await rmrf(dir);
    await cleanup(ctx, projectIds, []);
  }
});

test("Multiple documents in one Project share one PR folder; two Projects get separate folders", async () => {
  const ctx = await setup("Multi");
  const projectIds: string[] = [];
  const prNoA = `PR-${TAG}-multiA`;
  const prNoB = `PR-${TAG}-multiB`;
  try {
    const [resA, resB] = await Promise.all([
      fetch(`${ctx.url}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
        body: JSON.stringify(buildProjectData(prNoA, "PR Folder Project A")),
      }),
      fetch(`${ctx.url}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
        body: JSON.stringify(buildProjectData(prNoB, "PR Folder Project B")),
      }),
    ]);
    const projectA = ((await resA.json()).data as { id: string }).id;
    const projectB = ((await resB.json()).data as { id: string }).id;
    projectIds.push(projectA, projectB);

    async function upload(projectId: string, name: string) {
      const form = new FormData();
      form.append("file", pdfFile(name));
      const res = await fetch(`${ctx.url}/projects/${projectId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.ownerToken}` },
        body: form,
      });
      assert.equal(res.status, 201);
      return ((await res.json()).data as { id: string }).id;
    }

    const docA1 = await upload(projectA, "A-one.pdf");
    const docA2 = await upload(projectA, "A-two.pdf");
    const docB1 = await upload(projectB, "B-one.pdf");

    const [rowA1, rowA2, rowB1] = await Promise.all([
      prisma.document.findUniqueOrThrow({ where: { id: docA1 } }),
      prisma.document.findUniqueOrThrow({ where: { id: docA2 } }),
      prisma.document.findUniqueOrThrow({ where: { id: docB1 } }),
    ]);

    assert.notEqual(rowA1.storageKey, rowA2.storageKey, "each upload gets its own unique UUID");

    const dirA = path.join(storageDir, prNoA);
    const dirB = path.join(storageDir, prNoB);
    assert.ok(await pathExists(path.join(dirA, rowA1.storageKey)));
    assert.ok(await pathExists(path.join(dirA, rowA2.storageKey)));
    assert.ok(await pathExists(path.join(dirB, rowB1.storageKey)));

    // Project A's folder contains exactly its own two files — Project B's
    // document never lands under Project A's folder, and vice versa.
    const entriesA = await fs.readdir(dirA);
    assert.deepEqual(new Set(entriesA), new Set([rowA1.storageKey, rowA2.storageKey]));
    const entriesB = await fs.readdir(dirB);
    assert.deepEqual(entriesB, [rowB1.storageKey]);

    await rmrf(dirA);
    await rmrf(dirB);
  } finally {
    await cleanup(ctx, projectIds, []);
  }
});

test("A Project prNo containing a path separator is rejected at upload time — never escapes the storage root", async () => {
  const ctx = await setup("Traversal");
  const projectIds: string[] = [];
  // validatePrCategoryPrNoRule only requires the prefix "PR-" plus a
  // non-empty suffix — it does not forbid "/" or "\" in that suffix, so
  // Project creation itself succeeds with this value; the storage layer's
  // own sanitizer (sanitizePrNoForStorage) is the real, final gate.
  const dangerousPrNo = `PR-${TAG}/../../evil`;
  try {
    const projectRes = await fetch(`${ctx.url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify(buildProjectData(dangerousPrNo, "PR Folder Traversal Project")),
    });
    assert.equal(projectRes.status, 201, "Project creation itself is not restricted by this rule — only document storage is");
    const projectId = ((await projectRes.json()).data as { id: string }).id;
    projectIds.push(projectId);

    const before = await prisma.document.count({ where: { projectId } });

    const form = new FormData();
    form.append("file", pdfFile());
    const uploadRes = await fetch(`${ctx.url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 400, "a prNo containing '/' must be rejected before any file is written");
    assert.equal(await prisma.document.count({ where: { projectId } }), before, "no Document row must be created for a rejected upload");

    // Nothing was written anywhere outside the configured storage root, and
    // nothing stray was left directly under the storage root either.
    const rootEntries = await fs.readdir(storageDir).catch(() => [] as string[]);
    for (const entry of rootEntries) {
      assert.doesNotMatch(entry, /evil/, "no 'evil' artifact must ever appear under the storage root");
    }
    const parentOfStorageDir = path.dirname(storageDir);
    const outsideEntries = await fs.readdir(parentOfStorageDir).catch(() => [] as string[]);
    for (const entry of outsideEntries) {
      assert.doesNotMatch(entry, /evil/, "no 'evil' artifact must ever appear outside the storage root");
    }
  } finally {
    await cleanup(ctx, projectIds, []);
  }
});

test("A Project prNo containing a backslash is also rejected at upload time", async () => {
  const ctx = await setup("Backslash");
  const projectIds: string[] = [];
  const dangerousPrNo = `PR-${TAG}\\windows\\escape`;
  try {
    const projectRes = await fetch(`${ctx.url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify(buildProjectData(dangerousPrNo, "PR Folder Backslash Project")),
    });
    assert.equal(projectRes.status, 201);
    const projectId = ((await projectRes.json()).data as { id: string }).id;
    projectIds.push(projectId);

    const form = new FormData();
    form.append("file", pdfFile());
    const uploadRes = await fetch(`${ctx.url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 400, "a prNo containing '\\\\' must be rejected before any file is written");
  } finally {
    await cleanup(ctx, projectIds, []);
  }
});

test("Editing a Project's PR Number moves its document folder; the document stays downloadable", async () => {
  const ctx = await setup("Rename");
  const projectIds: string[] = [];
  const oldPrNo = `PR-${TAG}-old`;
  const newPrNo = `PR-${TAG}-new`;
  try {
    const projectRes = await fetch(`${ctx.url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify(buildProjectData(oldPrNo, "PR Folder Rename Project")),
    });
    assert.equal(projectRes.status, 201);
    const projectId = ((await projectRes.json()).data as { id: string }).id;
    projectIds.push(projectId);

    const form = new FormData();
    form.append("file", pdfFile());
    const uploadRes = await fetch(`${ctx.url}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const doc = (await uploadRes.json()).data as { id: string };
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

    const oldDir = path.join(storageDir, oldPrNo);
    const newDir = path.join(storageDir, newPrNo);
    assert.ok(await pathExists(path.join(oldDir, row.storageKey)), "file must exist under the old PR folder before the rename");

    const patchRes = await fetch(`${ctx.url}/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify({ prNo: newPrNo }),
    });
    assert.equal(patchRes.status, 200, "the prNo edit itself must succeed");

    assert.ok(!(await pathExists(oldDir)), "the old PR folder must be gone after the rename");
    assert.ok(await pathExists(path.join(newDir, row.storageKey)), "the file must now exist under the new PR folder");

    // Document.storageKey is unchanged — the DB never had to know the
    // folder name at all.
    const rowAfter = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(rowAfter.storageKey, row.storageKey);

    const downloadRes = await fetch(`${ctx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${ctx.ownerToken}` } });
    assert.equal(downloadRes.status, 200, "download must resolve under the new PR folder transparently");
    assert.equal(Buffer.from(new Uint8Array(await downloadRes.arrayBuffer())).toString(), "%PDF-1.4");

    await rmrf(newDir);
  } finally {
    await cleanup(ctx, projectIds, []);
  }
});

test("PR Request documents remain flat (no PR-number folder) before approval", async () => {
  const ctx = await setup("PrReqFlat");
  let prRequestId: string | undefined;
  const createdDocIds: string[] = [];
  try {
    const prRequest = await prisma.pRRequest.create({
      data: { requestedByUserId: ctx.ownerId, projectData: {}, status: "Draft" },
    });
    prRequestId = prRequest.id;

    const form = new FormData();
    form.append("file", pdfFile("Draft Doc.pdf"));
    const uploadRes = await fetch(`${ctx.url}/pr-requests/${prRequestId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const doc = (await uploadRes.json()).data as { id: string };
    createdDocIds.push(doc.id);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

    assert.ok(await pathExists(path.join(storageDir, row.storageKey)), "a PR Request document must sit flat directly under the storage root");

    const downloadRes = await fetch(`${ctx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${ctx.ownerToken}` } });
    assert.equal(downloadRes.status, 200);

    await rmrf(path.join(storageDir, row.storageKey));
  } finally {
    if (createdDocIds.length) await prisma.document.deleteMany({ where: { id: { in: createdDocIds } } });
    if (prRequestId) await prisma.pRRequest.deleteMany({ where: { id: prRequestId } });
    await cleanup(ctx, [], []);
  }
});

test("PR Request -> Project approval repoint physically moves the document into the Project's PR folder", async () => {
  const ctx = await setup("Repoint");
  const projectIds: string[] = [];
  let prRequestId: string | undefined;
  const targetPrNo = `PR-${TAG}-repoint`;
  try {
    const prRequest = await prisma.pRRequest.create({
      data: { requestedByUserId: ctx.ownerId, projectData: {}, status: "Draft" },
    });
    prRequestId = prRequest.id;

    const form = new FormData();
    form.append("file", pdfFile("Pre-Approval.pdf"));
    const uploadRes = await fetch(`${ctx.url}/pr-requests/${prRequestId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const doc = (await uploadRes.json()).data as { id: string };
    const rowBefore = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    assert.ok(await pathExists(path.join(storageDir, rowBefore.storageKey)), "document must be flat before repoint");

    const projectRes = await fetch(`${ctx.url}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify(buildProjectData(targetPrNo, "PR Folder Repoint Target Project")),
    });
    assert.equal(projectRes.status, 201);
    const projectId = ((await projectRes.json()).data as { id: string }).id;
    projectIds.push(projectId);

    // Exercises the exact function pmoManagerApprove() calls on real PR
    // approval (prRequest.service.ts) — not the full multi-stage HTTP
    // approval chain, which is unrelated to this physical-storage concern.
    await repointDocumentsToProject(prRequestId, projectId);

    const rowAfter = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(rowAfter.projectId, projectId);
    assert.equal(rowAfter.prRequestId, null);
    assert.equal(rowAfter.storageKey, rowBefore.storageKey, "storageKey (the bare UUID) is never rewritten by a repoint");

    assert.ok(!(await pathExists(path.join(storageDir, rowBefore.storageKey))), "file must no longer sit flat at the storage root");
    const newPath = path.join(storageDir, targetPrNo, rowBefore.storageKey);
    assert.ok(await pathExists(newPath), "file must now exist under the target Project's PR folder");

    const downloadRes = await fetch(`${ctx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${ctx.ownerToken}` } });
    assert.equal(downloadRes.status, 200, "download must succeed for the repointed document, now resolved as a Project document");
    assert.equal(Buffer.from(new Uint8Array(await downloadRes.arrayBuffer())).toString(), "%PDF-1.4");

    await rmrf(path.join(storageDir, targetPrNo));
  } finally {
    if (prRequestId) await prisma.pRRequest.deleteMany({ where: { id: prRequestId } });
    await cleanup(ctx, projectIds, []);
  }
});

test("Customer GST documents remain flat (no PR-number folder) and unaffected by the Project change", async () => {
  const ctx = await setup("Customer");
  const customerIds: string[] = [];
  try {
    const customerRes = await fetch(`${ctx.url}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.ownerToken}` },
      body: JSON.stringify({ customerName: `${TAG}-customer`, status: "Active" }),
    });
    assert.equal(customerRes.status, 201);
    const customerId = ((await customerRes.json()).data as { id: string }).id;
    customerIds.push(customerId);

    const form = new FormData();
    form.append("file", pdfFile("GST Cert.pdf"));
    const uploadRes = await fetch(`${ctx.url}/customers/${customerId}/gst-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.ownerToken}` },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const doc = (await uploadRes.json()).data as { id: string };
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });

    assert.ok(await pathExists(path.join(storageDir, row.storageKey)), "a Customer GST document must sit flat directly under the storage root");

    const downloadRes = await fetch(`${ctx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${ctx.ownerToken}` } });
    assert.equal(downloadRes.status, 200);
    assert.equal(Buffer.from(new Uint8Array(await downloadRes.arrayBuffer())).toString(), "%PDF-1.4");

    const deleteRes = await fetch(`${ctx.url}/documents/${doc.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${ctx.adminToken}` } });
    assert.equal(deleteRes.status, 200);
    assert.ok(!(await pathExists(path.join(storageDir, row.storageKey))));
  } finally {
    await cleanup(ctx, [], customerIds);
  }
});
