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
 * Mandatory CC per stage of the Request Invoice lifecycle, end to end (Oct 2026): a real Request Invoice is created over HTTP, the invoice is
 * raised and then paid over HTTP, and the three emails the server composes are captured by a FAKE mail transport (no SMTP connection is ever
 * opened). Proves:
 *   - "Invoice Request Assigned" (the Request Invoice email) and "Invoice Raised" are CC'd to arun@ifluids.com AND accounts@ifluids.com
 *     (and not to info@ifluids.com), on every path (with and without CC members / manual addresses),
 *   - "Invoice Paid" is CC'd to arun@ifluids.com AND accounts@ifluids.com (and no longer to info@ifluids.com),
 *   - the saved CC member and the manually entered addresses are preserved, in order, without duplicates, on the emails that carry them.
 *
 * Run with SMTP_* blanked (the test aborts if SMTP is configured).
 */

const TAG = `mandcc-${Date.now()}`;

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
  member: { id: "", email: "" },
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
  const passwordHash = await hashPassword("MandatoryCc@123");
  const make = (key: string, extra: object) =>
    prisma.portalUser.create({
      data: { fullName: `Mandatory CC ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: engineer.id, forcePasswordChange: false, ...extra },
    });
  const requester = await make("requester", { moduleAccess: { create: { moduleId: invoicesModule.id } } });
  const raiser = await make("raiser", {
    moduleAccess: { create: { moduleId: invoicesModule.id } },
    approvalPermissions: { create: approvals.map((a) => ({ approvalTypeId: a.id })) },
  });
  const member = await make("member", {});
  fx.userIds.push(requester.id, raiser.id, member.id);
  fx.requester = { id: requester.id, email: requester.email, token: tokenFor(requester, engineer.name) };
  fx.raiser = { id: raiser.id, email: raiser.email, token: tokenFor(raiser, engineer.name) };
  fx.member = { id: member.id, email: member.email };
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

/** The first captured email whose subject starts with `subjectStart` (the Request / Raised subjects are project-specific: "Invoice request - …", "Invoice has been raised - …"). */
async function waitForMail(subjectStart: string): Promise<SentMail> {
  for (let i = 0; i < 80; i++) {
    const mail = sent.find((m) => m.subject.startsWith(subjectStart));
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the email "${subjectStart}" was never sent`);
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

test("Assigned, Raised and Paid all CC arun@ + accounts@ (Paid no longer info@); members and manual addresses are preserved without duplicates", async () => {
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: "India",
      prNo: `PR-${TAG}`,
      client: "Mandatory CC Client",
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: "Mandatory CC regression",
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
  fx.projectIds.push(project.id);
  const quantityItem = await prisma.quantityItem.create({
    data: { projectId: project.id, description: "Item", woQty: 10, uom: "DAY", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10_000 },
  });

  // ---- 1. Invoice Request Assigned ----
  // Manual addresses: a real extra, both mandatory addresses typed again in another letter case (must not repeat), the saved member again
  // (must not repeat), the assignee (never repeated in CC) and info@ifluids.com — now just an ordinary address for this email, kept once.
  const create = await call("POST", `/projects/${project.id}/invoice-requests`, fx.requester.token, {
    assignedToUserId: fx.raiser.id,
    ccMemberUserIds: [fx.member.id],
    additionalCcEmails: ["Extra@Customer.com", "ARUN@ifluids.com", "Accounts@IFluids.com", fx.member.email.toUpperCase(), fx.raiser.email, "info@ifluids.com"],
  });
  assert.equal(create.status, 201, create.json.message);

  const assigned = await waitForMail("Invoice request - ");
  assert.equal(assigned.subject, `Invoice request - Mandatory CC Client - Mandatory CC regression - PR-${TAG}`);
  assert.equal(assigned.to, fx.raiser.email);
  assert.deepEqual(
    assigned.cc,
    ["arun@ifluids.com", "accounts@ifluids.com", fx.member.email, "extra@customer.com", "info@ifluids.com"],
    "arun@ and accounts@ first, then the saved member, then the manual addresses; no duplicates; the assignee is not in CC"
  );

  // ---- 2. Invoice Raised ----
  const draft = await call("POST", `/quantity/${quantityItem.id}/invoice-lines`, fx.raiser.token, {
    invoiceNo: `${TAG}-INV`,
    invoiceDate: new Date("2026-02-01").toISOString(),
    quantityBilled: 1,
    invoiceAmountINR: 1000,
    status: "Draft",
  });
  assert.equal(draft.status, 201);
  const lineId = draft.json.data!.id;
  assert.equal((await call("PATCH", `/invoice-lines/${lineId}`, fx.raiser.token, { status: "Raised" })).status, 200);

  const raised = await waitForMail("Invoice has been raised - ");
  assert.equal(raised.subject, `Invoice has been raised - Mandatory CC Client - Mandatory CC regression - PR-${TAG}`);
  assert.equal(raised.to, fx.requester.email);
  assert.deepEqual(raised.cc, ["arun@ifluids.com", "accounts@ifluids.com", fx.member.email], "Raised: arun@ and accounts@ first, then the saved member (manual addresses were never persisted)");

  // ---- 3. Invoice Paid ----
  assert.equal((await call("PATCH", `/invoice-lines/${lineId}`, fx.raiser.token, { status: "Paid" })).status, 200);
  const paid = await waitForMail(EMAIL_SUBJECTS.INVOICE_PAID(project.projectTitle, project.prNo));
  assert.equal(paid.to, fx.requester.email);
  assert.deepEqual(paid.cc, ["arun@ifluids.com", "accounts@ifluids.com", fx.member.email], "Paid: arun@ and accounts@ first (arun@ replaced info@), then the saved member");
  assert.ok(!(paid.cc as string[]).includes("info@ifluids.com"), "Paid no longer carries info@ifluids.com");

  // Cross-check of the whole lifecycle: arun@ AND accounts@ are on all three emails, each exactly once, and info@ only as an ordinary manual address on Assigned.
  const ccOf = (m: SentMail) => (m.cc as string[]).map((e) => e.toLowerCase());
  for (const m of [assigned, raised, paid]) {
    for (const mandatory of ["arun@ifluids.com", "accounts@ifluids.com"]) assert.equal(ccOf(m).filter((e) => e === mandatory).length, 1, mandatory);
  }
  assert.ok(!ccOf(raised).includes("info@ifluids.com") && !ccOf(paid).includes("info@ifluids.com"));
});

test("with NO CC members and NO manual addresses: Assigned, Raised and Paid are each CC'd to exactly arun@ + accounts@", async () => {
  sent = [];
  const tag2 = `${TAG}-bare`;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: "India",
      prNo: `PR-${tag2}`,
      client: "Mandatory CC Client 2",
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: "Mandatory CC bare regression",
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      workOrderNumber: `${tag2}-WO`,
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

  const create = await call("POST", `/projects/${project.id}/invoice-requests`, fx.requester.token, { assignedToUserId: fx.raiser.id });
  assert.equal(create.status, 201, create.json.message);
  const assigned = await waitForMail("Invoice request - ");
  assert.equal(assigned.subject, `Invoice request - Mandatory CC Client - Mandatory CC bare - PR-${tag2}`);
  assert.equal(assigned.to, fx.raiser.email);
  assert.deepEqual(assigned.cc, ["arun@ifluids.com", "accounts@ifluids.com"]);

  const draft = await call("POST", `/quantity/${quantityItem.id}/invoice-lines`, fx.raiser.token, {
    invoiceNo: `${tag2}-INV`,
    invoiceDate: new Date("2026-02-01").toISOString(),
    quantityBilled: 1,
    invoiceAmountINR: 1000,
    status: "Draft",
  });
  assert.equal(draft.status, 201);
  const lineId = draft.json.data!.id;
  assert.equal((await call("PATCH", `/invoice-lines/${lineId}`, fx.raiser.token, { status: "Raised" })).status, 200);
  const raised = await waitForMail("Invoice has been raised - ");
  assert.equal(raised.subject, `Invoice has been raised - Mandatory CC Client - Mandatory CC bare - PR-${tag2}`);
  assert.equal(raised.to, fx.requester.email);
  assert.deepEqual(raised.cc, ["arun@ifluids.com", "accounts@ifluids.com"]);

  assert.equal((await call("PATCH", `/invoice-lines/${lineId}`, fx.raiser.token, { status: "Paid" })).status, 200);
  const paid = await waitForMail(EMAIL_SUBJECTS.INVOICE_PAID(project.projectTitle, project.prNo));
  assert.equal(paid.to, fx.requester.email);
  assert.deepEqual(paid.cc, ["arun@ifluids.com", "accounts@ifluids.com"]);
});
