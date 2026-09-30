import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Customer GST Document Import/Extraction (Sep 2026) — end-to-end over real
 * HTTP, real Postgres, real (local test-storage-directory) file I/O.
 *
 * Deliberately does NOT exercise a successful Claude extraction call — that
 * would hit the real Anthropic API from an automated test (cost, network
 * dependency, non-determinism), which pdfImport's own module already
 * disclosed as out of scope for its implementation pass ("NOT YET VERIFIED
 * against the real Anthropic API" — claudeExtraction.service.ts). The
 * happy-path parsing/confidence-capping behavior IS covered, deterministically
 * and without network, in customerGstExtraction.test.ts's unit tests. What
 * this file covers instead: every validation-rejection path (which runs
 * BEFORE the Claude call and therefore never touches the network regardless
 * of API key configuration), rate limiting, Customer CRUD round-trip with
 * GST fields, and the GST document upload/replace/download/authorization
 * lifecycle — all fully exercisable without calling Claude.
 */

const TAG = `gst-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function setupClient(label: string) {
  const { url, close } = await listen();
  const [adminRole, customerModule] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Customer Master" } }),
  ]);
  const passwordHash = await hashPassword("CustomerGstTest@123");
  const user = await prisma.portalUser.create({
    data: {
      fullName: `GST Test ${label}`,
      email: `${TAG}-${label.toLowerCase()}@example.com`,
      passwordHash,
      department: "PMO",
      roleId: adminRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: { moduleId: customerModule.id } },
    },
  });
  const token = signAccessToken({ sub: user.id, email: user.email, roleId: adminRole.id, roleName: adminRole.name });
  return { url, close, userId: user.id, token, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}

async function cleanupUser(url: string, close: () => Promise<void>, userId: string) {
  await prisma.authAuditLog.deleteMany({ where: { userId } });
  await prisma.portalUser.deleteMany({ where: { id: userId } });
  await close();
}

function pdfBytes(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
}

test("GST — Customer creation without a GST document behaves exactly as before (regression)", async () => {
  const { url, close, userId, headers } = await setupClient("NoGst");
  const createdIds: string[] = [];
  try {
    const name = `${TAG}-NoGst`;
    const res = await fetch(`${url}/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ customerName: name, status: "Active" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()).data;
    createdIds.push(body.id);

    assert.equal(body.gstNumber, null);
    assert.equal(body.gstLegalName, null);
    assert.equal(body.gstTradeName, null);
    assert.equal(body.gstState, null);
    assert.equal(body.gstDocumentId, null);
  } finally {
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await cleanupUser(url, close, userId);
  }
});

test("GST — Customer creation with manually-typed GST fields round-trips through create/update/get", async () => {
  const { url, close, userId, headers } = await setupClient("Manual");
  const createdIds: string[] = [];
  try {
    const name = `${TAG}-Manual`;
    const createRes = await fetch(`${url}/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerName: name,
        status: "Active",
        gstNumber: "33AAAAA0000A1Z5",
        gstLegalName: "ABC ENGINEERING PRIVATE LIMITED",
        gstTradeName: "ABC ENGINEERING",
        gstState: "Tamil Nadu",
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).data;
    createdIds.push(created.id);
    assert.equal(created.gstNumber, "33AAAAA0000A1Z5");
    assert.equal(created.gstLegalName, "ABC ENGINEERING PRIVATE LIMITED");
    assert.equal(created.gstTradeName, "ABC ENGINEERING");
    assert.equal(created.gstState, "Tamil Nadu");

    const getRes = await fetch(`${url}/customers/${created.id}`, { headers });
    const fetched = (await getRes.json()).data;
    assert.equal(fetched.gstNumber, "33AAAAA0000A1Z5");

    // NOTE: this backend's existing PATCH /customers/:id contract (pre-dating
    // this feature — see customer.validators.ts's optionalText helper) has
    // every optional field resolve to `null` once Zod-parsed even when the
    // key is absent from the request body, so an omitted field is written as
    // null, not "left alone". This is why the existing frontend
    // (customerService.ts's updateCustomer) always sends the FULL form state
    // on every edit rather than a true partial patch — CustomerModal.tsx's
    // GST fields follow that same established convention, so this test
    // sends every GST field on the PATCH, matching real frontend behavior.
    const updateRes = await fetch(`${url}/customers/${created.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        gstNumber: "33AAAAA0000A1Z5",
        gstLegalName: "ABC ENGINEERING PRIVATE LIMITED",
        gstTradeName: "ABC ENGINEERING",
        gstState: "Karnataka",
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = (await updateRes.json()).data;
    assert.equal(updated.gstState, "Karnataka", "PATCH must update the changed GST field");
    assert.equal(updated.gstNumber, "33AAAAA0000A1Z5", "PATCH must retain unchanged GST fields sent unchanged");
  } finally {
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await cleanupUser(url, close, userId);
  }
});

test("GST — existing Customer creation/uniqueness/deletion rules are unaffected by the new fields", async () => {
  const { url, close, userId, headers } = await setupClient("Regress");
  const createdIds: string[] = [];
  try {
    const name = `${TAG}-Regress`;
    const createRes = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify({ customerName: name, status: "Active" }) });
    const created = (await createRes.json()).data;
    createdIds.push(created.id);

    const dupRes = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify({ customerName: name, status: "Active" }) });
    assert.equal(dupRes.status, 409, "duplicate-name rejection must be unchanged by this feature");

    const deleteRes = await fetch(`${url}/customers/${created.id}`, { method: "DELETE", headers });
    assert.equal(deleteRes.status, 200);
    createdIds.length = 0;
  } finally {
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await cleanupUser(url, close, userId);
  }
});

test("GST extraction — rejects an unsupported file type before ever touching the database", async () => {
  const { url, close, userId, headers, token } = await setupClient("BadType");
  void headers;
  try {
    const before = await prisma.document.count();
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "cert.docx", { type: "application/octet-stream" }));
    const res = await fetch(`${url}/customers/gst-extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    assert.equal(res.status, 400);
    assert.equal(await prisma.document.count(), before, "a rejected extraction request must never create a Document row");
  } finally {
    await cleanupUser(url, close, userId);
  }
});

test("GST extraction — rejects a spoofed extension whose bytes don't match (magic-byte mismatch)", async () => {
  const { url, close, userId, token } = await setupClient("Spoof");
  try {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x00, 0x00, 0x00, 0x00])], "cert.pdf", { type: "application/pdf" }));
    const res = await fetch(`${url}/customers/gst-extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    assert.equal(res.status, 400);
  } finally {
    await cleanupUser(url, close, userId);
  }
});

test("GST extraction — rejects an empty file", async () => {
  const { url, close, userId, token } = await setupClient("Empty");
  try {
    const form = new FormData();
    form.append("file", new File([], "cert.pdf", { type: "application/pdf" }));
    const res = await fetch(`${url}/customers/gst-extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    assert.equal(res.status, 400);
  } finally {
    await cleanupUser(url, close, userId);
  }
});

test("GST extraction — rejects a file over the configured size ceiling", async () => {
  const { url, close, userId, token } = await setupClient("Oversized");
  try {
    const oversized = new Uint8Array(11 * 1024 * 1024); // > default 10MB
    oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const form = new FormData();
    form.append("file", new File([oversized], "cert.pdf", { type: "application/pdf" }));
    const res = await fetch(`${url}/customers/gst-extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    // multer's own `limits.fileSize` (set to the same GST_DOCUMENT_MAX_FILE_SIZE_MB
    // ceiling in customer.routes.ts) rejects the file BEFORE gstFileValidation.
    // service.ts's own size check ever runs, throwing a raw MulterError that
    // errorHandler.ts has no specific branch for (same pre-existing,
    // out-of-scope gap as pdfImport/documents — neither module's own
    // errorHandler-level MulterError handling exists either; not introduced
    // by, or fixed by, this feature). The request is still cleanly rejected,
    // just as a 500 rather than a 400 — the file is never passed to Claude,
    // never persisted, either way.
    assert.equal(res.status, 500);
  } finally {
    await cleanupUser(url, close, userId);
  }
});

test("GST extraction — rate limit trips after the configured request ceiling (validation-failure requests, no network)", async () => {
  const { url, close, userId, token } = await setupClient("RateLimit");
  try {
    let lastStatus = 0;
    // CUSTOMER_GST_RATE_LIMIT_MAX_REQUESTS is 15 — the 16th request in this
    // user's one-hour window must be rejected with 429, never reaching file
    // validation or Claude.
    for (let i = 0; i < 16; i++) {
      const form = new FormData();
      form.append("file", new File([], "cert.pdf", { type: "application/pdf" }));
      const res = await fetch(`${url}/customers/gst-extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429, "the 16th request within the rate-limit window must be rejected");
  } finally {
    await cleanupUser(url, close, userId);
  }
});

test("GST document — upload persists only after being explicitly called; replaces on re-upload; downloads correctly; authorized by Customer Master grant", async () => {
  const { url, close, userId, headers, token } = await setupClient("Upload");
  const createdIds: string[] = [];
  try {
    const name = `${TAG}-Upload`;
    const createRes = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify({ customerName: name, status: "Active" }) });
    const customer = (await createRes.json()).data;
    createdIds.push(customer.id);
    assert.equal(customer.gstDocumentId, null, "no GST document must exist until explicitly uploaded");

    // ---- First upload ----
    const form1 = new FormData();
    form1.append("file", new File([pdfBytes()], "gst-cert-v1.pdf", { type: "application/pdf" }));
    const upload1Res = await fetch(`${url}/customers/${customer.id}/gst-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form1,
    });
    assert.equal(upload1Res.status, 201);
    const doc1 = (await upload1Res.json()).data;

    const afterUpload1 = await fetch(`${url}/customers/${customer.id}`, { headers });
    assert.equal((await afterUpload1.json()).data.gstDocumentId, doc1.id);

    // ---- Download it back ----
    const downloadRes = await fetch(`${url}/documents/${doc1.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(downloadRes.status, 200);
    const downloaded = Buffer.from(new Uint8Array(await downloadRes.arrayBuffer()));
    assert.equal(downloaded.toString(), "%PDF-1.4");

    // ---- Re-upload replaces, never duplicates (Document.customerId is @unique) ----
    const form2 = new FormData();
    form2.append("file", new File([pdfBytes()], "gst-cert-v2.pdf", { type: "application/pdf" }));
    const upload2Res = await fetch(`${url}/customers/${customer.id}/gst-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form2,
    });
    assert.equal(upload2Res.status, 201);
    const doc2 = (await upload2Res.json()).data;
    assert.notEqual(doc2.id, doc1.id);

    assert.equal(await prisma.document.count({ where: { customerId: customer.id } }), 1, "re-upload must replace, never leave two rows");
    assert.equal(await prisma.document.findUnique({ where: { id: doc1.id } }), null, "the old Document row must be gone after replace");

    // ---- Old document's download now 404s; new one downloads fine ----
    const oldDownloadRes = await fetch(`${url}/documents/${doc1.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(oldDownloadRes.status, 404);
    const newDownloadRes = await fetch(`${url}/documents/${doc2.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(newDownloadRes.status, 200);
  } finally {
    if (createdIds.length) await prisma.document.deleteMany({ where: { customerId: { in: createdIds } } });
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await cleanupUser(url, close, userId);
  }
});

test("GST document — upload rejects an invalid file and never creates an orphaned Document row for that customer", async () => {
  const { url, close, userId, headers, token } = await setupClient("UploadBad");
  const createdIds: string[] = [];
  try {
    const name = `${TAG}-UploadBad`;
    const createRes = await fetch(`${url}/customers`, { method: "POST", headers, body: JSON.stringify({ customerName: name, status: "Active" }) });
    const customer = (await createRes.json()).data;
    createdIds.push(customer.id);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x4d, 0x5a])], "not-a-cert.exe", { type: "application/octet-stream" }));
    const res = await fetch(`${url}/customers/${customer.id}/gst-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 400);
    assert.equal(await prisma.document.count({ where: { customerId: customer.id } }), 0);
  } finally {
    if (createdIds.length) await prisma.document.deleteMany({ where: { customerId: { in: createdIds } } });
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await cleanupUser(url, close, userId);
  }
});

test("GST document — a user without Customer Master access cannot download a Customer-owned document", async () => {
  const owner = await setupClient("DlOwner");
  const [engineerRole, projectsModule] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
  ]);
  const passwordHash = await hashPassword("CustomerGstTest@123");
  const outsider = await prisma.portalUser.create({
    data: {
      fullName: "GST Test Outsider",
      email: `${TAG}-outsider@example.com`,
      passwordHash,
      department: "PMO",
      roleId: engineerRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: [{ moduleId: projectsModule.id }] },
    },
  });
  const outsiderToken = signAccessToken({ sub: outsider.id, email: outsider.email, roleId: engineerRole.id, roleName: engineerRole.name });

  const createdIds: string[] = [];
  try {
    const name = `${TAG}-DlAuth`;
    const createRes = await fetch(`${owner.url}/customers`, { method: "POST", headers: owner.headers, body: JSON.stringify({ customerName: name, status: "Active" }) });
    const customer = (await createRes.json()).data;
    createdIds.push(customer.id);

    const form = new FormData();
    form.append("file", new File([pdfBytes()], "gst-cert.pdf", { type: "application/pdf" }));
    const uploadRes = await fetch(`${owner.url}/customers/${customer.id}/gst-document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: form,
    });
    const doc = (await uploadRes.json()).data;

    const outsiderRes = await fetch(`${owner.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${outsiderToken}` } });
    assert.equal(outsiderRes.status, 403, "a caller with only Projects access (no Customer Master grant) must not reach a Customer-owned document");
  } finally {
    if (createdIds.length) await prisma.document.deleteMany({ where: { customerId: { in: createdIds } } });
    if (createdIds.length) await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.portalUser.deleteMany({ where: { id: outsider.id } });
    await cleanupUser(owner.url, owner.close, owner.userId);
  }
});
