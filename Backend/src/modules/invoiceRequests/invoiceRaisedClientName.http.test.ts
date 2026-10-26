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
 * Invoice Raised email — Client Name (Oct 2026), end to end: a real Request Invoice is created over HTTP, a real invoice line is
 * raised over HTTP, and the email the server then composes is captured by a FAKE mail transport (no SMTP connection is ever opened).
 * Proves the client name shown in the email is the Project's own client — read from the database, not typed in anywhere else — that it
 * is escaped, that a blank client degrades cleanly, and that the rest of the email is as before.
 *
 * Run with SMTP_* blanked (the test aborts if SMTP is configured).
 */

const TAG = `raisedclient-${Date.now()}`;

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
  raiser: { id: "", token: "" },
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
  const passwordHash = await hashPassword("RaisedClient@123");
  const make = (key: string, extra: object) =>
    prisma.portalUser.create({
      data: { fullName: `Raised Client ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: engineer.id, forcePasswordChange: false, ...extra },
    });
  const requester = await make("requester", { moduleAccess: { create: { moduleId: invoicesModule.id } } });
  const raiser = await make("raiser", {
    moduleAccess: { create: { moduleId: invoicesModule.id } },
    approvalPermissions: { create: approvals.map((a) => ({ approvalTypeId: a.id })) },
  });
  fx.userIds.push(requester.id, raiser.id);
  fx.requester = { id: requester.id, email: requester.email, token: tokenFor(requester, engineer.name) };
  fx.raiser = { id: raiser.id, token: tokenFor(raiser, engineer.name) };
});

after(async () => {
  setEmailTransportForTests(null);
  try {
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: fx.projectIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
    // InvoiceLine restricts deleting its QuantityItem, so the raised lines go before the project (which cascades the items).
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: fx.projectIds } } } });
    await prisma.project.deleteMany({ where: { id: { in: fx.projectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: fx.userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: fx.userIds } } });
  } finally {
    await fx.close(); // always close the server, so a cleanup failure can never leave the test process hanging
  }
});

async function makeProject(suffix: string, client: string, projectTitle: string) {
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: "India",
      prNo: `PR-${TAG}-${suffix}`,
      client,
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      workOrderNumber: `${TAG}-WO-${suffix}`,
      workOrderDate: new Date("2026-01-01"),
      eicName: "EIC",
      contractType: "LUMP SUM",
      pmoCoordinator: "PMO",
      createdByUserId: null,
    },
  });
  fx.projectIds.push(project.id);
  const quantityItem = await prisma.quantityItem.create({
    data: { projectId: project.id, description: `Item ${suffix}`, woQty: 10, uom: "DAY", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10_000 },
  });
  return { project, quantityItem };
}

/** Requests an invoice for the project, raises it, and returns the Invoice Raised email the server sent to the requester. */
async function requestAndRaise(projectId: string, quantityItemId: string, invoiceNo: string): Promise<SentMail> {
  sent = [];
  const create = await fetch(`${fx.url}/projects/${projectId}/invoice-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.requester.token}` },
    body: JSON.stringify({ assignedToUserId: fx.raiser.id }),
  });
  assert.equal(create.status, 201);
  await create.text(); // always read bodies — an unread response keeps its connection open and server.close() in after() would wait for it

  const draft = await fetch(`${fx.url}/quantity/${quantityItemId}/invoice-lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.raiser.token}` },
    body: JSON.stringify({ invoiceNo, invoiceDate: new Date("2026-02-01").toISOString(), quantityBilled: 1, invoiceAmountINR: 1000, status: "Draft" }),
  });
  assert.equal(draft.status, 201);
  const line = ((await draft.json()) as { data: { id: string } }).data;
  const raised = await fetch(`${fx.url}/invoice-lines/${line.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.raiser.token}` },
    body: JSON.stringify({ status: "Raised" }),
  });
  assert.equal(raised.status, 200);
  await raised.text();

  for (let i = 0; i < 60; i++) {
    const mail = sent.find((m) => m.subject === EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the Invoice Raised email was never sent");
}

const detailsCells = (html: string): string[] => {
  const start = html.indexOf("margin:16px 0; border:1px solid #E2E8F0");
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]!.trim());
};

test("the Invoice Raised email shows the Project's own client, between PR Number and Project Title, with the rest of the email intact", async () => {
  const client = "Hindustan Petroleum Corporation Limited";
  const title = "Quantitative Risk Assessment (QRA) for the refinery";
  const { project, quantityItem } = await makeProject("a", client, title);

  const mail = await requestAndRaise(project.id, quantityItem.id, `${TAG}-INV-A`);

  assert.deepEqual(detailsCells(mail.html), ["PR Number", project.prNo, "Client Name", client, "Project Title", title]);
  assert.equal(mail.to, fx.requester.email, "still addressed to the original requester");
  assert.equal(mail.subject, "Your requested invoice has been raised");
  assert.match(mail.html, /Hello Raised Client requester,/);
  assert.match(mail.html, /Your requested invoice has been successfully raised\./);
  assert.match(mail.html, /Open Project Invoices/);
  assert.ok(mail.html.includes(`href="${env.FRONTEND_URL}/projects/edit/${project.id}"`), "the button still links to this project's invoices");
});

test("the client name comes from the Project record: editing it changes the next email — nothing is hardcoded or taken from the title", async () => {
  const { project, quantityItem } = await makeProject("b", "Original Client Ltd", "Title that mentions Original Client Ltd");
  await prisma.project.update({ where: { id: project.id }, data: { client: "Renamed Client Pvt Ltd" } });

  const mail = await requestAndRaise(project.id, quantityItem.id, `${TAG}-INV-B`);
  const cells = detailsCells(mail.html);
  assert.equal(cells[3], "Renamed Client Pvt Ltd");
  assert.ok(!cells[3]!.includes("Original"));
});

test("a client name containing markup or ampersands is escaped in the real email", async () => {
  const { project, quantityItem } = await makeProject("c", `Oil & Gas <b>Co</b> "Q" Ltd`, "Escaping check");
  const mail = await requestAndRaise(project.id, quantityItem.id, `${TAG}-INV-C`);
  assert.equal(detailsCells(mail.html)[3], "Oil &amp; Gas &lt;b&gt;Co&lt;/b&gt; &quot;Q&quot; Ltd");
  assert.ok(!mail.html.includes("<b>Co</b>"));
});

test("a blank client degrades cleanly: the email is still sent with PR Number, Project Title and the button — no empty Client Name row", async () => {
  const { project, quantityItem } = await makeProject("d", "   ", "Blank client check");
  const mail = await requestAndRaise(project.id, quantityItem.id, `${TAG}-INV-D`);
  assert.deepEqual(detailsCells(mail.html), ["PR Number", project.prNo, "Project Title", "Blank client check"]);
  assert.ok(!mail.html.includes("Client Name"));
  assert.match(mail.html, /Open Project Invoices/);
});

test("a hostile project title is escaped in the real email too — in the Title cell and in the hidden preview text — and adds no markup", async () => {
  const title = `</div><a href="https://evil.example/login">Verify</a><img src="https://evil.example/p.gif">`;
  const { project, quantityItem } = await makeProject("e", "Plain Client Ltd", title);
  const mail = await requestAndRaise(project.id, quantityItem.id, `${TAG}-INV-E`);

  const escaped = "&lt;/div&gt;&lt;a href=&quot;https://evil.example/login&quot;&gt;Verify&lt;/a&gt;&lt;img src=&quot;https://evil.example/p.gif&quot;&gt;";
  assert.deepEqual(detailsCells(mail.html), ["PR Number", project.prNo, "Client Name", "Plain Client Ltd", "Project Title", escaped]);
  assert.ok(!mail.html.includes('<a href="https://evil') && !mail.html.includes("<img src="), "no injected tag is emitted");
  const preview = mail.html.match(/<div style="display:none; max-height:0; overflow:hidden; opacity:0;">([\s\S]*?)<\/div>/)?.[1];
  assert.equal(preview, `Your requested invoice for ${escaped} has been raised.`, "the hidden preview block is not closed early by the title");
  assert.match(mail.html, /Open Project Invoices/);
});
