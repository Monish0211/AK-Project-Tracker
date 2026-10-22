import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, mock, test } from "node:test";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { env } from "../../shared/utils/env.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { isEmailConfigured, setEmailTransportForTests } from "../../shared/email/transporter.js";
import { createInvoiceRequest as createInvoiceRequestService } from "./services/invoiceRequest.service.js";

/**
 * Request Invoice attachments (Oct 2026) — end to end over real HTTP and real Postgres, with a CAPTURING fake mail transport (no
 * SMTP connection is ever opened) and a private document-storage folder. Proves: the JSON-only path is unchanged; multipart
 * uploads are validated, stored, recorded and emailed as real attachments to the right recipients; every rejection and failure
 * leaves no file behind; delivery outcomes are recorded honestly; attachments are not served by the portal; permanent project
 * deletion removes the physical files.
 *
 * Run against a scratch database with SMTP_* blanked (the test aborts if SMTP is configured). Each test removes the files it created.
 */

const TAG = `invatt-${Date.now()}`;
const MB = 1024 * 1024;
const storageDir = path.resolve(env.DOCUMENT_STORAGE_PATH);

interface SentMail {
  to: unknown;
  cc: unknown;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string; contentType: string }[];
}
let attempts: SentMail[] = [];
let behavior: (mail: SentMail, attemptNo: number) => void | Promise<void> = () => {};

const pdf = (size = 2048) => Buffer.concat([Buffer.from("%PDF-1.4\n%test\n"), Buffer.alloc(Math.max(0, size - 15), 0x20)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const openXml = (folder: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`[Content_Types].xml ${folder}x.xml`), Buffer.alloc(200, 2)]);

interface UploadFile {
  name: string;
  data: Buffer;
  type?: string;
}
function multipart(payload: object | string | null, files: UploadFile[]): FormData {
  const form = new FormData();
  if (payload !== null) form.append("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  for (const f of files) form.append("files", new File([new Uint8Array(f.data)], f.name, { type: f.type ?? "application/octet-stream" }));
  return form;
}

async function listStoredFiles(dir = storageDir): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listStoredFiles(full)));
    else out.push(full);
  }
  return out;
}

const fx = {
  url: "",
  close: async () => {},
  userIds: [] as string[],
  projectIds: [] as string[],
  A: { id: "", email: "", token: "" }, // requester
  B: { id: "", email: "", token: "" }, // responsible person (Raise Invoice)
  C: { id: "", email: "", token: "" }, // CC member
  D: { id: "" }, // inactive
  E: { id: "", token: "" }, // no Invoices module
  F: { id: "", token: "" }, // may delete projects permanently
  projectId: "",
  projectPrNo: "",
};

function tokenFor(user: { id: string; email: string; roleId: string }, roleName: string): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName });
}

function projectData(prNo: string, createdByUserId: string | null) {
  return {
    poMonth: "2026-09",
    prCategory: "India",
    prNo,
    client: "Attachment Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Invoice Request attachments regression",
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

before(async () => {
  // Safety rail: this test must never be able to reach a real mail server (one test deliberately removes the fake transport to prove
  // the "email not configured" outcome, which is only safe when SMTP really is blank). Run with SMTP_* blanked.
  assert.ok(!env.SMTP_HOST && !env.SMTP_PASS, "ABORT: SMTP is configured — blank the SMTP_* variables before running this test");
  assert.equal(isEmailConfigured(), false);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fx.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fx.close = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  setEmailTransportForTests({
    sendMail: (async (options: SentMail) => {
      attempts.push(options);
      await behavior(options, attempts.length);
      return { messageId: "test" };
    }) as never,
  });

  const [engineer, invoicesModule, projectsModule, raiseInvoice, deletePerm] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findUniqueOrThrow({ where: { name: "Delete Project Permanently" } }),
  ]);
  const passwordHash = await hashPassword("InvAttTest@123");
  const make = (key: string, extra: object) =>
    prisma.portalUser.create({
      data: { fullName: `Att ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: engineer.id, forcePasswordChange: false, ...extra },
    });
  const [A, B, C, D, E, F] = await Promise.all([
    make("a", { moduleAccess: { create: { moduleId: invoicesModule.id } } }),
    make("b", { moduleAccess: { create: { moduleId: invoicesModule.id } }, approvalPermissions: { create: { approvalTypeId: raiseInvoice.id } } }),
    make("c", { moduleAccess: { create: { moduleId: invoicesModule.id } } }),
    make("d", { isActive: false, moduleAccess: { create: { moduleId: invoicesModule.id } } }),
    make("e", {}),
    make("f", { moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] }, approvalPermissions: { create: { approvalTypeId: deletePerm.id } } }),
  ]);
  fx.userIds.push(A.id, B.id, C.id, D.id, E.id, F.id);
  fx.A = { id: A.id, email: A.email, token: tokenFor(A, engineer.name) };
  fx.B = { id: B.id, email: B.email, token: tokenFor(B, engineer.name) };
  fx.C = { id: C.id, email: C.email, token: tokenFor(C, engineer.name) };
  fx.D = { id: D.id };
  fx.E = { id: E.id, token: tokenFor(E, engineer.name) };
  fx.F = { id: F.id, token: tokenFor(F, engineer.name) };

  fx.projectPrNo = `${TAG}-PR`;
  const project = await prisma.project.create({ data: projectData(fx.projectPrNo, null) });
  fx.projectId = project.id;
  fx.projectIds.push(project.id);
});

after(async () => {
  setEmailTransportForTests(null);
  mock.restoreAll();
  await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: fx.projectIds } } });
  await prisma.document.deleteMany({ where: { projectId: { in: fx.projectIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
  await prisma.project.deleteMany({ where: { id: { in: fx.projectIds } } });
  await prisma.authAuditLog.deleteMany({ where: { userId: { in: fx.userIds } } });
  await prisma.portalUser.deleteMany({ where: { id: { in: fx.userIds } } });
  await fx.close();
});

interface CreatedRequest {
  id: string;
  status: string;
  emailStatus: string | null;
  emailDetail: string | null;
  attachments: { id: string; fileName: string; fileSizeBytes: number }[];
  ccMembers: { id: string }[];
}

/** Removes the project's requests (their Document rows cascade) and every file they left, so each test starts clean. */
async function resetProject(): Promise<void> {
  const docs = await prisma.document.findMany({ where: { invoiceRequest: { projectId: fx.projectId } }, select: { storageKey: true } });
  await prisma.invoiceRequest.deleteMany({ where: { projectId: fx.projectId } });
  for (const d of docs) await fsp.unlink(path.join(storageDir, d.storageKey)).catch(() => {});
  attempts = [];
  behavior = () => {};
}

async function waitForOutcome(requestId: string): Promise<{ emailStatus: string | null; emailDetail: string | null }> {
  for (let i = 0; i < 80; i++) {
    const row = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: requestId }, select: { emailStatus: true, emailDetail: true } });
    if (row.emailStatus !== "pending") return row;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("email outcome stayed pending");
}

async function post(token: string, body: FormData | object, projectId = fx.projectId): Promise<{ status: number; json: { data?: CreatedRequest; message?: string } }> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${fx.url}/projects/${projectId}/invoice-requests`, {
    method: "POST",
    headers: isForm ? { Authorization: `Bearer ${token}` } : { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: isForm ? body : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as { data?: CreatedRequest; message?: string } };
}

const basePayload = () => ({ assignedToUserId: fx.B.id, notes: "Please raise this one." });

/** Asserts a request was rejected AND left nothing behind: no request row, no stored file, no email attempt. */
async function assertRejectedCleanly(before: string[], res: { status: number; json: { message?: string } }, status: number, messagePart: RegExp) {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${res.json.message}`);
  assert.match(res.json.message ?? "", messagePart);
  assert.equal(await prisma.invoiceRequest.count({ where: { projectId: fx.projectId } }), 0, "no request may exist after a rejection");
  assert.deepEqual(await listStoredFiles(), before, "no file may be left behind after a rejection");
  assert.equal(attempts.length, 0, "no email may be attempted after a rejection");
}

test("JSON-only request (no files) works exactly as before: 201, one email, no attachments, outcome 'sent'", async () => {
  await resetProject();
  const before = await listStoredFiles();
  const res = await post(fx.A.token, { ...basePayload(), ccMemberUserIds: [fx.C.id, fx.D.id, randomUUID()] });
  assert.equal(res.status, 201);
  const created = res.json.data!;
  assert.equal(created.status, "Open");
  assert.deepEqual(created.attachments, []);
  assert.equal(created.emailStatus, "pending", "the response never claims the email was sent — it has not been attempted yet");
  assert.deepEqual(created.ccMembers.map((m) => m.id), [fx.C.id], "inactive and unknown CC ids are still dropped");

  const outcome = await waitForOutcome(created.id);
  assert.equal(outcome.emailStatus, "sent");
  assert.equal(attempts.length, 1);
  const mail = attempts[0]!;
  assert.equal(mail.to, fx.B.email);
  assert.deepEqual(mail.cc, ["info@ifluids.com", fx.C.email], "info@ifluids.com first, then the CC member, no duplicates");
  assert.equal(mail.subject, "Invoice Request — please raise this invoice");
  assert.equal(mail.attachments, undefined, "no attachments key at all for a request without files");
  assert.ok(!/Attachments/.test(mail.html));
  assert.equal(await prisma.document.count({ where: { invoiceRequest: { projectId: fx.projectId } } }), 0);
  assert.deepEqual(await listStoredFiles(), before, "nothing is stored for a request without files");
});

test("one valid file: stored, recorded against the request only, and emailed as a real attachment to the right recipients", async () => {
  await resetProject();
  const content = pdf(5000);
  const res = await post(fx.A.token, multipart({ ...basePayload(), ccMemberUserIds: [fx.C.id] }, [{ name: "Invoice details.pdf", data: content, type: "application/pdf" }]));
  assert.equal(res.status, 201);
  const created = res.json.data!;
  assert.equal(created.emailStatus, "pending");
  assert.deepEqual(created.attachments.map((a) => [a.fileName, a.fileSizeBytes]), [["Invoice details.pdf", 5000]]);

  const outcome = await waitForOutcome(created.id);
  assert.equal(outcome.emailStatus, "sent_with_attachments");

  const doc = await prisma.document.findFirstOrThrow({ where: { invoiceRequestId: created.id } });
  assert.equal(doc.projectId, null, "never a Project document");
  assert.equal(doc.prRequestId, null);
  assert.equal(doc.customerId, null);
  assert.match(doc.storageKey, /^[0-9a-f-]{36}$/, "opaque UUID key, never the file name");
  assert.equal(doc.mimeType, "application/pdf");
  assert.equal(doc.uploadedByUserId, fx.A.id);
  const onDisk = await fsp.readFile(path.join(storageDir, doc.storageKey));
  assert.ok(onDisk.equals(content), "the stored file is byte-identical to the upload");

  assert.equal(attempts.length, 1);
  const mail = attempts[0]!;
  assert.equal(mail.to, fx.B.email);
  assert.deepEqual(mail.cc, ["info@ifluids.com", fx.C.email]);
  assert.equal(mail.attachments?.length, 1);
  assert.equal(mail.attachments![0]!.filename, "Invoice details.pdf");
  assert.equal(mail.attachments![0]!.contentType, "application/pdf");
  assert.equal(mail.attachments![0]!.path, path.join(storageDir, doc.storageKey), "attached from the stored file");
  assert.match(mail.html, /Attachments \(1\)/);
  assert.ok(mail.html.includes("Invoice details.pdf"));
  assert.ok(mail.html.includes("5 KB"), "the readable list shows the size");

  // listing: names and sizes only — no storage key, no download link
  const list = await fetch(`${fx.url}/projects/${fx.projectId}/invoice-requests`, { headers: { Authorization: `Bearer ${fx.A.token}` } });
  const listText = await list.text();
  assert.ok(listText.includes("Invoice details.pdf"));
  assert.ok(!listText.includes(doc.storageKey), "the storage key must never be exposed");
  assert.match(listText, /"emailStatus":"sent_with_attachments"/);
});

test("attachments are not in the Project Documents list and cannot be downloaded through the portal", async () => {
  await resetProject();
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf(), type: "application/pdf" }]));
  assert.equal(res.status, 201);
  await waitForOutcome(res.json.data!.id);
  const doc = await prisma.document.findFirstOrThrow({ where: { invoiceRequestId: res.json.data!.id } });

  const projectDocs = await fetch(`${fx.url}/projects/${fx.projectId}/documents`, { headers: { Authorization: `Bearer ${fx.F.token}` } });
  assert.equal(projectDocs.status, 200);
  const listed = ((await projectDocs.json()) as { data: { id: string }[] }).data;
  assert.ok(!listed.some((d) => d.id === doc.id), "invoice-request files must not appear in the general Project Documents list");

  const download = await fetch(`${fx.url}/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${fx.F.token}` } });
  assert.equal(download.status, 404, "no portal download exists for these files");
});

test("several valid files (pdf, docx, xlsx, png): all stored and all attached, in order, with unique safe names", async () => {
  await resetProject();
  const res = await post(
    fx.A.token,
    multipart(basePayload(), [
      { name: "one.pdf", data: pdf(1000) },
      { name: "two.docx", data: openXml("word/") },
      { name: "three.xlsx", data: openXml("xl/") },
      { name: "four.png", data: png() },
      { name: "ONE.pdf", data: pdf(1200) }, // same name, different case
    ])
  );
  assert.equal(res.status, 201);
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "sent_with_attachments");
  assert.deepEqual(attempts[0]!.attachments!.map((a) => a.filename), ["one.pdf", "two.docx", "three.xlsx", "four.png", "ONE (2).pdf"]);
  assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 5);
  for (const a of attempts[0]!.attachments!) await fsp.access(a.path);
});

test("rejections are clean: nothing stored, no request, no email — spoofed, empty, blocked, too many, too big, too large in total", async () => {
  await resetProject();
  const stored = await listStoredFiles();
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(300, 0x90)]);

  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(basePayload(), [{ name: "ok.pdf", data: pdf() }, { name: "invoice.pdf", data: exe }])), 400, /real PDF/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(basePayload(), [{ name: "empty.pdf", data: Buffer.alloc(0) }])), 400, /empty/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(basePayload(), [{ name: "run.exe", data: exe }])), 400, /not an allowed file type/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(basePayload(), [{ name: "page.html", data: Buffer.from("<html>") }])), 400, /not an allowed file type/);
  await assertRejectedCleanly(
    stored,
    await post(fx.A.token, multipart(basePayload(), Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, data: pdf() })))),
    400,
    /at most 5 files/
  );
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(basePayload(), [{ name: "big.pdf", data: pdf(10 * MB + 1) }])), 413, /10 MB or smaller|larger than 10 MB/);
  await assertRejectedCleanly(
    stored,
    await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf(8 * MB) }, { name: "b.pdf", data: pdf(8 * MB) }, { name: "c.pdf", data: pdf(8 * MB) }])),
    413,
    /total more than 20 MB/
  );
});

test("a malformed multipart submission is a clear 400, never a success and never a 500", async () => {
  await resetProject();
  const stored = await listStoredFiles();
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart(null, [{ name: "a.pdf", data: pdf() }])), 400, /request details are missing/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart("{not json", [{ name: "a.pdf", data: pdf() }])), 400, /could not be read/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart('["array"]', [{ name: "a.pdf", data: pdf() }])), 400, /could not be read/);
  await assertRejectedCleanly(stored, await post(fx.A.token, multipart({ assignedToUserId: "" }, [{ name: "a.pdf", data: pdf() }])), 400, /Please select who should raise/);
  // an unexpected file field
  const form = new FormData();
  form.append("payload", JSON.stringify(basePayload()));
  form.append("attachments", new File([new Uint8Array(pdf())], "a.pdf"));
  await assertRejectedCleanly(stored, await post(fx.A.token, form), 400, /Unexpected file field/);
});

test("existing authorization and validation are intact for uploads: no module access, ineligible assignee, unknown project", async () => {
  await resetProject();
  const stored = await listStoredFiles();
  const files = [{ name: "a.pdf", data: pdf() }];

  const noModule = await post(fx.E.token, multipart(basePayload(), files));
  assert.equal(noModule.status, 403);
  assert.deepEqual(await listStoredFiles(), stored, "an unauthorized caller's upload is never stored");

  // an assignee who does not hold Raise Invoice (user C) is rejected BEFORE any file is written
  const ineligible = await post(fx.A.token, multipart({ assignedToUserId: fx.C.id }, files));
  await assertRejectedCleanly(stored, ineligible, 400, /does not currently hold the Raise Invoice permission/);

  const unknownProject = await post(fx.A.token, multipart(basePayload(), files), randomUUID());
  assert.ok([403, 404].includes(unknownProject.status), `unknown project must be refused, got ${unknownProject.status}`);
  assert.deepEqual(await listStoredFiles(), stored);
});

test("a duplicate request (409) with files cleans up every file it wrote", async () => {
  await resetProject();
  const first = await post(fx.A.token, basePayload());
  assert.equal(first.status, 201);
  await waitForOutcome(first.json.data!.id);
  const stored = await listStoredFiles();
  attempts = [];

  const dup = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }, { name: "b.pdf", data: pdf() }]));
  assert.equal(dup.status, 409);
  assert.match(dup.json.message ?? "", /already pending/);
  assert.deepEqual(await listStoredFiles(), stored, "both files written before the 409 must be removed");
  assert.equal(await prisma.invoiceRequest.count({ where: { projectId: fx.projectId } }), 1, "only the original request exists");
  assert.equal(attempts.length, 0, "the rejected duplicate sends no email");
});

test("a database failure after the files were written removes the files", async () => {
  await resetProject();
  const stored = await listStoredFiles();
  const ghost = { sub: randomUUID(), email: "ghost@example.com", roleId: randomUUID(), roleName: "Administrator" };
  const file = { originalname: "a.pdf", mimetype: "application/pdf", size: 2048, buffer: pdf() };
  await assert.rejects(() => createInvoiceRequestService(fx.projectId, basePayload(), ghost, [file, { ...file, originalname: "b.pdf" }]));
  assert.deepEqual(await listStoredFiles(), stored, "the foreign-key failure must not leave orphan files");
  assert.equal(await prisma.invoiceRequest.count({ where: { projectId: fx.projectId } }), 0);
});

test("a storage failure part-way through removes the files already written and creates no request", async () => {
  await resetProject();
  const stored = await listStoredFiles();
  const original = fsp.writeFile.bind(fsp);
  let calls = 0;
  const spy = mock.method(fsp, "writeFile", async (...args: Parameters<typeof fsp.writeFile>) => {
    calls += 1;
    if (calls === 2) throw new Error("disk full (simulated)");
    return original(...args);
  });
  try {
    const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }, { name: "b.pdf", data: pdf() }, { name: "c.pdf", data: pdf() }]));
    assert.equal(res.status, 500, "a storage failure is reported as a failure, never a success");
    assert.notEqual(res.json.data?.status, "Open");
  } finally {
    spy.mock.restore();
  }
  assert.deepEqual(await listStoredFiles(), stored, "the file written before the failure was removed");
  assert.equal(await prisma.invoiceRequest.count({ where: { projectId: fx.projectId } }), 0);
  assert.equal(attempts.length, 0);
});

test("malicious file names are neutralised in storage metadata, in the attachment name and in the email HTML", async () => {
  await resetProject();
  const res = await post(fx.A.token, multipart({ ...basePayload(), notes: "<img src=x onerror=alert(1)>" }, [{ name: "../../evil\r\n<img src=x onerror=alert(2)>.pdf", data: pdf() }]));
  assert.equal(res.status, 201);
  await waitForOutcome(res.json.data!.id);
  const doc = await prisma.document.findFirstOrThrow({ where: { invoiceRequestId: res.json.data!.id } });
  assert.ok(!/[\\/\r\n<>]/.test(doc.fileName), `stored name must be safe, got ${JSON.stringify(doc.fileName)}`);
  const mail = attempts[0]!;
  assert.ok(!/[\\/\r\n<>]/.test(mail.attachments![0]!.filename));
  assert.ok(!mail.html.includes("<img"), "no raw markup from a file name or a note may reach the email HTML");
  assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt;"), "the note is shown as escaped text");
});

test("too large for the safe email size: the request and files are saved, the email says plainly the files could not be attached", async () => {
  await resetProject();
  // 2 x 8 MB passes the upload limits (<=10 MB each, <=20 MB total) but encodes to ~21.9 MB — over the 20 MB email ceiling.
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf(8 * MB) }, { name: "b.pdf", data: pdf(8 * MB) }]));
  assert.equal(res.status, 201);
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "sent_without_attachments");
  assert.match(outcome.emailDetail ?? "", /NOT attached/);
  assert.equal(attempts.length, 1, "one email, without the files — the oversized message is never even offered to the server");
  const mail = attempts[0]!;
  assert.equal(mail.attachments, undefined);
  assert.match(mail.html, /could NOT be attached to this email/);
  assert.ok(!/Attachments \(\d\)/.test(mail.html));
  assert.equal(mail.to, fx.B.email);
  assert.equal((mail.cc as string[])[0], "info@ifluids.com");
  assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 2, "the files are retained");
  for (const d of await prisma.document.findMany({ where: { invoiceRequestId: res.json.data!.id } })) await fsp.access(path.join(storageDir, d.storageKey));
});

test("the mail server rejects the message as too large: one retry WITHOUT the files, said plainly, files retained", async () => {
  await resetProject();
  behavior = (mail) => {
    if (mail.attachments?.length) throw Object.assign(new Error("Message failed: 552 5.3.4 Message size exceeds fixed limit"), { responseCode: 552, response: "552 5.3.4 Message size exceeds fixed limit", command: "DATA", code: "EMESSAGE" });
  };
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }]));
  assert.equal(res.status, 201);
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "sent_without_attachments");
  assert.match(outcome.emailDetail ?? "", /rejected the message as too large/);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]!.attachments?.length, 1);
  assert.equal(attempts[1]!.attachments, undefined);
  assert.match(attempts[1]!.html, /could NOT be attached to this email/);
  assert.match(attempts[1]!.html, /rejected the message as too large/);
  assert.deepEqual(attempts[1]!.cc, attempts[0]!.cc, "same recipients on the follow-up");
  assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 1);
});

test("an ambiguous SMTP outcome (timeout) is recorded as 'unconfirmed' and is NEVER retried — no duplicate notification", async () => {
  await resetProject();
  behavior = () => {
    throw Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT", command: "DATA" });
  };
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }]));
  assert.equal(res.status, 201);
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "unconfirmed");
  assert.match(outcome.emailDetail ?? "", /may or may not have been delivered/);
  assert.equal(attempts.length, 1, "exactly one attempt — a retry could notify the same person twice");
  assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 1, "the files are retained");
  assert.equal(await prisma.invoiceRequest.count({ where: { projectId: fx.projectId } }), 1, "the request is retained");
});

test("a definitive refusal is recorded as 'failed' (no retry) and the request and files are kept", async () => {
  await resetProject();
  behavior = () => {
    throw Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550, response: "550 mailbox unavailable", command: "RCPT TO" });
  };
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }]));
  assert.equal(res.status, 201);
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "failed");
  assert.match(outcome.emailDetail ?? "", /was not sent/);
  assert.equal(attempts.length, 1);
  assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 1);
});

test("if the smaller follow-up email also fails, the outcome is 'failed' / 'unconfirmed' — never a success", async () => {
  await resetProject();
  behavior = (mail, attemptNo) => {
    if (attemptNo === 1) throw Object.assign(new Error("552 too large"), { responseCode: 552, response: "552 5.3.4 too large" });
    throw Object.assign(new Error("socket closed"), { code: "ESOCKET" });
  };
  const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }]));
  const outcome = await waitForOutcome(res.json.data!.id);
  assert.equal(outcome.emailStatus, "unconfirmed");
  assert.equal(attempts.length, 2);
});

test("a request WITHOUT files whose email fails is recorded as failed — the response never says it was sent", async () => {
  await resetProject();
  behavior = () => {
    throw Object.assign(new Error("550 refused"), { responseCode: 550, response: "550 refused" });
  };
  const res = await post(fx.A.token, basePayload());
  assert.equal(res.status, 201);
  assert.equal(res.json.data!.emailStatus, "pending");
  assert.equal((await waitForOutcome(res.json.data!.id)).emailStatus, "failed");
});

test("email not configured on the server: recorded as failed with an accurate reason, request and files kept", async () => {
  await resetProject();
  setEmailTransportForTests(null); // SMTP is blank in this run, so sendEmail() sees "not configured"
  try {
    const res = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }]));
    assert.equal(res.status, 201);
    const outcome = await waitForOutcome(res.json.data!.id);
    assert.equal(outcome.emailStatus, "failed");
    assert.match(outcome.emailDetail ?? "", /not configured/);
    assert.equal(await prisma.document.count({ where: { invoiceRequestId: res.json.data!.id } }), 1);
  } finally {
    setEmailTransportForTests({
      sendMail: (async (options: SentMail) => {
        attempts.push(options);
        await behavior(options, attempts.length);
        return { messageId: "test" };
      }) as never,
    });
  }
});

test("permanent project deletion removes the stored files of the project's documents AND its invoice-request attachments", async () => {
  await resetProject();
  const prNo = `${TAG}-DEL`;
  const project = await prisma.project.create({ data: projectData(prNo, null) });
  fx.projectIds.push(project.id);

  // an invoice request with two attachments
  const req = await post(fx.A.token, multipart(basePayload(), [{ name: "a.pdf", data: pdf() }, { name: "b.pdf", data: pdf() }]), project.id);
  assert.equal(req.status, 201);
  await waitForOutcome(req.json.data!.id);
  // and an ordinary Project document (stored in the PR-number folder)
  const upload = await fetch(`${fx.url}/projects/${project.id}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fx.F.token}` },
    body: (() => {
      const f = new FormData();
      f.append("file", new File([new Uint8Array(pdf())], "project.pdf", { type: "application/pdf" }));
      return f;
    })(),
  });
  assert.equal(upload.status, 201);

  const requestDocs = await prisma.document.findMany({ where: { invoiceRequest: { projectId: project.id } } });
  const projectDocs = await prisma.document.findMany({ where: { projectId: project.id } });
  assert.equal(requestDocs.length, 2);
  assert.equal(projectDocs.length, 1);
  const paths = [...requestDocs.map((d) => path.join(storageDir, d.storageKey)), ...projectDocs.map((d) => path.join(storageDir, prNo, d.storageKey))];
  for (const p of paths) await fsp.access(p);

  const del = await fetch(`${fx.url}/projects/${project.id}/permanent`, { method: "DELETE", headers: { Authorization: `Bearer ${fx.F.token}` } });
  assert.equal(del.status, 200);

  for (const p of paths) await assert.rejects(() => fsp.access(p), `${p} must be gone`);
  await assert.rejects(() => fsp.access(path.join(storageDir, prNo)), "the now-empty PR-number folder is removed too");
  assert.equal(await prisma.document.count({ where: { OR: [{ projectId: project.id }, { invoiceRequest: { projectId: project.id } }] } }), 0);
});
