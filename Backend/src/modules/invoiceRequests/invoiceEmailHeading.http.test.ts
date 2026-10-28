import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { EMAIL_SUBJECTS } from "../../shared/email/email.constants.js";
import { isEmailConfigured, setEmailTransportForTests } from "../../shared/email/transporter.js";
import { env } from "../../shared/utils/env.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Heading of the Invoice Request and Invoice Raised emails, end to end (Oct 2026): a real Request Invoice is created over HTTP for a project with a
 * LONG client name and project title, the invoice is raised over HTTP, and both emails the server composes are captured by a FAKE mail transport
 * (no SMTP connection is ever opened). Proves the headings are built from the actual project row, are cut to the first three words, end with the
 * complete PR number, and that everything else — subject, recipients, the full names in the details table and in the database — is unchanged.
 *
 * Run with SMTP_* blanked (the test aborts if SMTP is configured).
 */

const TAG = `emailhdr-${Date.now()}`;
const CLIENT = "Benchmark Customer Long Name Limited";
const TITLE = "Heading regression with a deliberately long project title";

interface SentMail {
  to: unknown;
  cc: unknown;
  subject: string;
  html: string;
}
let sent: SentMail[] = [];

const fx = {
  url: "",
  close: async () => {},
  userIds: [] as string[],
  projectIds: [] as string[],
  requester: { id: "", email: "", token: "" },
  raiser: { id: "", email: "", token: "" },
};

const tokenFor = (user: { id: string; email: string; roleId: string }, roleName: string) =>
  signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName });

before(async () => {
  assert.ok(!env.SMTP_HOST && !env.SMTP_PASS, "ABORT: SMTP is configured — blank the SMTP_* variables before running this test");
  setEmailTransportForTests({
    sendMail: (async (options: SentMail) => {
      sent.push(options);
      return { messageId: "test" };
    }) as never,
  });
  assert.equal(isEmailConfigured(), true, "the fake transport is installed");

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fx.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fx.close = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, invoicesModule, approvals] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    prisma.approvalType.findMany({ where: { name: { in: ["Raise Invoice", "Edit Invoice", "Delete Invoice"] } } }),
  ]);
  assert.equal(approvals.length, 3, "approval types missing — run the migrations");
  const passwordHash = await hashPassword("EmailHdr@123");
  const make = (key: string, extra: object) =>
    prisma.portalUser.create({
      data: { fullName: `Email Heading ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: engineer.id, forcePasswordChange: false, ...extra },
    });
  const requester = await make("requester", { moduleAccess: { create: { moduleId: invoicesModule.id } } });
  const raiser = await make("raiser", {
    moduleAccess: { create: { moduleId: invoicesModule.id } },
    approvalPermissions: { create: approvals.map((a) => ({ approvalTypeId: a.id })) },
  });
  fx.userIds.push(requester.id, raiser.id);
  fx.requester = { id: requester.id, email: requester.email, token: tokenFor(requester, engineer.name) };
  fx.raiser = { id: raiser.id, email: raiser.email, token: tokenFor(raiser, engineer.name) };
});

after(async () => {
  setEmailTransportForTests(null);
  try {
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: fx.projectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
    // InvoiceLine restricts deleting its QuantityItem, so the lines go before the project (which cascades the items).
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: fx.projectIds } } } });
    await prisma.project.deleteMany({ where: { id: { in: fx.projectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: fx.userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: fx.userIds } } });
  } finally {
    await fx.close(); // always close the server, so a cleanup failure can never leave the test process hanging
  }
});

async function waitForMail(subject: string): Promise<SentMail> {
  for (let i = 0; i < 80; i++) {
    const mail = sent.find((m) => m.subject === subject);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the email "${subject}" was never sent`);
}

async function call(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${fx.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; message?: string };
  return { status: res.status, json };
}

/** The heading (<h2>) of a captured email, as a mail client displays it (HTML entities decoded). */
function headingOf(html: string): string {
  const all = [...html.matchAll(/<h2 style="[^"]*">([\s\S]*?)<\/h2>/g)];
  assert.equal(all.length, 1, "exactly one heading in the email");
  return all[0]![1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

async function makeProject(prNo: string, client: string, projectTitle: string) {
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: "India",
      prNo,
      client,
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      workOrderNumber: `${prNo}-WO`,
      workOrderDate: new Date("2026-01-01"),
      eicName: "EIC",
      contractType: "LUMP SUM",
      pmoCoordinator: "PMO",
      createdByUserId: null,
    },
  });
  fx.projectIds.push(project.id);
  const quantityItem = await prisma.quantityItem.create({
    data: { projectId: project.id, description: "Item", woQty: 10, uom: "DAY", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10_000 },
  });
  return { project, quantityItem };
}

test("both emails carry the heading built from the real project: first 3 words of client and title, then the complete PR number; nothing else changes", async () => {
  const { project, quantityItem } = await makeProject(`PR-${TAG}`, CLIENT, TITLE);

  // ---- Invoice Request (Assigned) ----
  const create = await call("POST", `/projects/${project.id}/invoice-requests`, fx.requester.token, { assignedToUserId: fx.raiser.id });
  assert.equal(create.status, 201, create.json.message);
  const assigned = await waitForMail(EMAIL_SUBJECTS.INVOICE_REQUEST_ASSIGNED);
  assert.equal(headingOf(assigned.html), `Invoice request - Benchmark Customer Long - Heading regression with - ${project.prNo}`);
  assert.equal(assigned.subject, "Invoice Request — please raise this invoice", "the subject line is unchanged");
  assert.equal(assigned.to, fx.raiser.email, "recipient unchanged");
  assert.ok(assigned.html.includes(`>${CLIENT}</td>`) && assigned.html.includes(`>${TITLE}</td>`) && assigned.html.includes(`>${project.prNo}</td>`), "the details table still shows the FULL values");
  assert.match(assigned.html, /Hello Email Heading raiser,/);
  assert.match(assigned.html, /has requested that you raise the invoice for the project below\./);
  assert.match(assigned.html, /Open Project Invoices/);

  // ---- Invoice Raised ----
  const draft = await call("POST", `/quantity/${quantityItem.id}/invoice-lines`, fx.raiser.token, {
    invoiceNo: `${TAG}-INV`,
    invoiceDate: new Date("2026-02-01").toISOString(),
    quantityBilled: 1,
    invoiceAmountINR: 1000,
    status: "Draft",
  });
  assert.equal(draft.status, 201);
  assert.equal((await call("PATCH", `/invoice-lines/${draft.json.data!.id}`, fx.raiser.token, { status: "Raised" })).status, 200);
  const raised = await waitForMail(EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
  assert.equal(headingOf(raised.html), `Invoice has been raised - Benchmark Customer Long - Heading regression with - ${project.prNo}`);
  assert.equal(raised.subject, "Your requested invoice has been raised", "the subject line is unchanged");
  assert.equal(raised.to, fx.requester.email, "recipient unchanged");
  assert.ok(raised.html.includes(`>${CLIENT}</td>`) && raised.html.includes(`>${TITLE}</td>`), "the details table still shows the FULL values");
  assert.match(raised.html, /Hello Email Heading requester,/);
  assert.match(raised.html, /Your requested invoice has been successfully raised\./);

  // ---- the full names are preserved in the database: only the heading is shortened ----
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { client: true, projectTitle: true, prNo: true } });
  assert.deepEqual(stored, { client: CLIENT, projectTitle: TITLE, prNo: project.prNo });
});

test("a short client and title (three words or fewer) are shown whole, with surrounding spaces and a special character handled", async () => {
  sent = [];
  const { project, quantityItem } = await makeProject(`PR-${TAG}-b`, "  TEST   CLIENT ", " Q&A  Study ");
  const create = await call("POST", `/projects/${project.id}/invoice-requests`, fx.requester.token, { assignedToUserId: fx.raiser.id });
  assert.equal(create.status, 201, create.json.message);
  const assigned = await waitForMail(EMAIL_SUBJECTS.INVOICE_REQUEST_ASSIGNED);
  assert.equal(headingOf(assigned.html), `Invoice request - TEST CLIENT - Q&A Study - ${project.prNo}`);
  assert.ok(assigned.html.includes("Q&amp;A Study"), "the ampersand is HTML-escaped in the markup");

  const draft = await call("POST", `/quantity/${quantityItem.id}/invoice-lines`, fx.raiser.token, {
    invoiceNo: `${TAG}-INV-b`,
    invoiceDate: new Date("2026-02-01").toISOString(),
    quantityBilled: 1,
    invoiceAmountINR: 1000,
    status: "Draft",
  });
  assert.equal(draft.status, 201);
  assert.equal((await call("PATCH", `/invoice-lines/${draft.json.data!.id}`, fx.raiser.token, { status: "Raised" })).status, 200);
  const raised = await waitForMail(EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
  assert.equal(headingOf(raised.html), `Invoice has been raised - TEST CLIENT - Q&A Study - ${project.prNo}`);
});
