import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { env } from "../../shared/utils/env.js";

/**
 * Document upload limit (Nov 2026): 100 MB per file, end to end through the real Express + multer stack. A file of exactly 100 MB is
 * stored, listed and downloaded byte-for-byte; one byte more is refused with a clean 413 and leaves no Document row and no file; PR
 * Request uploads follow the same limit; several files in a row all persist; country access still refuses another country's project
 * before anything is written. Storage layout is unchanged: Project files under <root>/<PR No>/<uuid>, PR Request files flat.
 */

const TAG = `dul-${Date.now()}`;
const MB = 1024 * 1024;
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], prRequests: [] as string[] };
const storageRoot = path.resolve(env.DOCUMENT_STORAGE_PATH);

interface Actor {
  id: string;
  token: string;
}
const u = {} as Record<string, Actor>;
let projectId = "";
let projectPrNo = "";

async function makeUser(label: string, roleName: string, modules: string[], regions: string[] = [], allCountries = false): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const regionRows = await prisma.region.findMany({ where: { name: { in: regions } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `DUL ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("DocUploadLimit@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: allCountries,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: regionRows.map((r) => ({ regionId: r.id })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
}

/** A PDF-signed buffer of exactly `size` bytes (the backend checks the %PDF signature of a .pdf). */
function pdfOf(size: number): Blob {
  const buf = Buffer.alloc(size, 0x20);
  buf.write("%PDF-1.4\n", 0, "latin1");
  return new Blob([buf], { type: "application/pdf" });
}

async function upload(actor: Actor, target: string, blob: Blob, name: string): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("file", blob, name);
  const res = await fetch(`${url}${target}`, { method: "POST", headers: { Authorization: `Bearer ${actor.token}` }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const filesIn = async (dir: string) => (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile()).map((e) => e.name).sort();

before(async () => {
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
    if ((process.env[k] ?? "").trim() !== "") throw new Error(`refusing to run: ${k} is set (the local SMTP is a real mailbox)`);
  }
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  u["owner"] = await makeUser("owner", "Engineer", ["Projects", "Add Project"]);
  u["admin"] = await makeUser("admin", "Administrator", ["Projects", "Add Project"], [], true);
  u["requester"] = await makeUser("requester", "PR Request User", ["Approvals", "PR Request"]);
  u["indiaAdmin"] = await makeUser("india-admin", "Administrator", ["Projects", "Add Project"], ["India"]);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  projectPrNo = `PR-${TAG}`;
  const res = await fetch(`${url}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${u["owner"]!.token}` },
    body: JSON.stringify({
      poMonth: "2026-11", prCategory: "India", prNo: projectPrNo, client: "DUL Client", department: "PMO", domesticForeign: "Domestic", projectTitle: `DUL ${TAG}`,
      workOrderStatus: "Received", projectStartDate: "2026-01-01", projectStatus: "Not Started", workOrderNumber: `WO-${TAG}`, workOrderDate: "2026-01-01",
      rfqNo: "RFQ-DUL", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO",
    }),
  });
  const text = await res.text();
  assert.equal(res.status, 201, text);
  projectId = (JSON.parse(text) as { data: { id: string } }).data.id;
  created.projects.push(projectId);
});

after(async () => {
  try {
    // Remove every test document through the real API first, so the physical files are deleted too.
    const docs = await prisma.document.findMany({ where: { OR: [{ projectId: { in: created.projects } }, { prRequestId: { in: created.prRequests } }] }, select: { id: true } });
    for (const d of docs) await fetch(`${url}/documents/${d.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${u["admin"]!.token}` } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: created.prRequests } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await fs.rmdir(path.join(storageRoot, projectPrNo)).catch(() => undefined);
    await prisma.authAuditLog.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { email: { startsWith: TAG } }] } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    process.env["COUNTRY_ACCESS_MODE"] = "off";
    await closeServer();
  }
});

describe("100 MB per file, end to end", () => {
  test("the configured limit is 100 MB", () => {
    assert.equal(env.DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB, 100);
  });

  test("a file of exactly 100 MB is stored under <root>/<PR No>/<uuid>, listed, and downloads byte-for-byte", async () => {
    const res = await upload(u["owner"]!, `/projects/${projectId}/documents`, pdfOf(100 * MB), "exactly-100mb.pdf");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.fileSizeBytes, 100 * MB);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: res.body.data.id } });
    assert.match(row.storageKey, /^[0-9a-f-]{36}$/, "the database still stores only the bare UUID");
    const stat = await fs.stat(path.join(storageRoot, projectPrNo, row.storageKey));
    assert.equal(stat.size, 100 * MB, "the physical file sits in the PR-number folder (layout unchanged)");

    const list = await fetch(`${url}/projects/${projectId}/documents`, { headers: { Authorization: `Bearer ${u["owner"]!.token}` } });
    assert.ok(((await list.json()) as { data: { id: string }[] }).data.some((d) => d.id === row.id));
    const dl = await fetch(`${url}/documents/${row.id}/download`, { headers: { Authorization: `Bearer ${u["owner"]!.token}` } });
    assert.equal(dl.status, 200);
    const bytes = Buffer.from(await dl.arrayBuffer());
    assert.equal(bytes.length, 100 * MB);
    assert.equal(bytes.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  });

  test("one byte over 100 MB is refused with a clear 413; no Document row and no file is left behind", async () => {
    const folder = path.join(storageRoot, projectPrNo);
    const filesBefore = await filesIn(folder);
    const flatBefore = await filesIn(storageRoot);
    const rowsBefore = await prisma.document.count({ where: { projectId } });
    const res = await upload(u["owner"]!, `/projects/${projectId}/documents`, pdfOf(100 * MB + 1), "too-big.pdf");
    assert.equal(res.status, 413, JSON.stringify(res.body));
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /100 MB/);
    assert.equal(await prisma.document.count({ where: { projectId } }), rowsBefore);
    assert.deepEqual(await filesIn(folder), filesBefore, "no partial file in the project folder");
    assert.deepEqual(await filesIn(storageRoot), flatBefore, "no stray file in the storage root");
  });

  test("an unsupported type is still refused (400), as before", async () => {
    const res = await upload(u["owner"]!, `/projects/${projectId}/documents`, new Blob(["MZ"], { type: "application/x-msdownload" }), "tool.exe");
    assert.equal(res.status, 400);
  });

  test("several files in a row (the frontend uploads them one at a time) all persist", async () => {
    for (const name of ["one.pdf", "two.pdf", "three.pdf"]) {
      const res = await upload(u["owner"]!, `/projects/${projectId}/documents`, pdfOf(2 * MB), name);
      assert.equal(res.status, 201, name);
    }
    const names = (await prisma.document.findMany({ where: { projectId }, select: { fileName: true } })).map((d) => d.fileName);
    for (const name of ["one.pdf", "two.pdf", "three.pdf", "exactly-100mb.pdf"]) assert.ok(names.includes(name), name);
  });
});

describe("PR Request uploads use the same limit (flat storage unchanged)", () => {
  test("a small file is stored flat; one byte over 100 MB is refused with 413 and leaves nothing", async () => {
    const draft = await fetch(`${url}/pr-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${u["requester"]!.token}` },
      body: JSON.stringify({
        projectData: {
          poMonth: "2026-11", prCategory: "India", prNo: `PR-${TAG}-req`, client: "DUL Client", department: "PMO", domesticForeign: "Domestic", projectTitle: `DUL req ${TAG}`,
          workOrderStatus: "Received", projectStartDate: "2026-01-01", projectStatus: "Not Started", workOrderNumber: `WO-${TAG}-req`, workOrderDate: "2026-01-01",
          rfqNo: "RFQ-DUL", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO",
        },
      }),
    });
    assert.equal(draft.status, 201);
    const requestId = ((await draft.json()) as { data: { id: string } }).data.id;
    created.prRequests.push(requestId);

    const ok = await upload(u["requester"]!, `/pr-requests/${requestId}/documents`, pdfOf(1 * MB), "supporting.pdf");
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const row = await prisma.document.findUniqueOrThrow({ where: { id: ok.body.data.id } });
    assert.equal((await fs.stat(path.join(storageRoot, row.storageKey))).size, 1 * MB, "PR Request files stay flat");

    const flatBefore = await filesIn(storageRoot);
    const big = await upload(u["requester"]!, `/pr-requests/${requestId}/documents`, pdfOf(100 * MB + 1), "too-big.pdf");
    assert.equal(big.status, 413);
    assert.match(big.body.message, /100 MB/);
    assert.equal(await prisma.document.count({ where: { prRequestId: requestId } }), 1);
    assert.deepEqual(await filesIn(storageRoot), flatBefore);
  });
});

describe("permissions and country access are unchanged", () => {
  test("enforce: an India-only Administrator cannot upload to, list or download an Oman project's documents; nothing is written", async () => {
    const oman = await prisma.region.findFirstOrThrow({ where: { name: "Oman" } });
    const omanProject = await prisma.project.create({
      data: {
        poMonth: "2026-11", prCategory: "Oman", prNo: `OM-${TAG}`, client: "DUL", department: "PMO", domesticForeign: "Foreign", projectTitle: `DUL Oman ${TAG}`,
        workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", regionId: oman.id, regionalCurrency: oman.defaultCurrency,
      },
    });
    created.projects.push(omanProject.id);
    const seeded = await upload(u["admin"]!, `/projects/${omanProject.id}/documents`, pdfOf(1024), "oman.pdf");
    assert.equal(seeded.status, 201);

    process.env["COUNTRY_ACCESS_MODE"] = "enforce";
    try {
      const before = await prisma.document.count({ where: { projectId: omanProject.id } });
      const filesBefore = await filesIn(path.join(storageRoot, `OM-${TAG}`));
      const up = await upload(u["indiaAdmin"]!, `/projects/${omanProject.id}/documents`, pdfOf(1024), "x.pdf");
      assert.equal(up.status, 403);
      assert.equal(await prisma.document.count({ where: { projectId: omanProject.id } }), before);
      assert.deepEqual(await filesIn(path.join(storageRoot, `OM-${TAG}`)), filesBefore);
      const list = await fetch(`${url}/projects/${omanProject.id}/documents`, { headers: { Authorization: `Bearer ${u["indiaAdmin"]!.token}` } });
      assert.equal(list.status, 403);
      const dl = await fetch(`${url}/documents/${seeded.body.data.id}/download`, { headers: { Authorization: `Bearer ${u["indiaAdmin"]!.token}` } });
      assert.equal(dl.status, 403);
      const anon = await fetch(`${url}/documents/${seeded.body.data.id}/download`);
      assert.equal(anon.status, 401);
    } finally {
      process.env["COUNTRY_ACCESS_MODE"] = "off";
    }
  });
});
