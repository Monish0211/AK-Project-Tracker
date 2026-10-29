import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { isEmailConfigured, setEmailTransportForTests } from "../../shared/email/transporter.js";
import { env } from "../../shared/utils/env.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Subject AND heading of the PR Request "approved" and "rejected" emails, end to end (Oct 2026): a real PR Request is drafted, sent to Accounts and approved /
 * rejected over HTTP against a real database, and every email the server composes is captured by a FAKE mail transport (no SMTP connection is ever opened).
 * Proves the service hands the request's client to the template, that the subject and the body heading are the same line with the FULL client and the FULL
 * project title and NO PR number, that the rejection reason is escaped, and that who receives each email (To only, no CC / BCC) is unchanged.
 *
 * Run with SMTP_* blanked (the test aborts if SMTP is configured).
 */

const TAG = `prsubj-${Date.now()}`;
const CLIENT = "HTH Technology Co Private Limited & Sons";
const TITLE = "3D F&G Mapping Services Project";
const APPROVED = "Your PR Request has been approved — Project created";
const REJECTED = "Your PR Request has been rejected";

interface SentMail {
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject: string;
  html: string;
}
let sent: SentMail[] = [];

const fx = {
  url: "",
  close: async () => {},
  userIds: [] as string[],
  prNos: [] as string[],
  requester: { id: "", email: "", token: "" },
  accounts: { id: "", email: "", token: "" },
  pmo: { id: "", email: "", token: "" },
};

const tokenFor = (user: { id: string; email: string; roleId: string }, roleName: string) => signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName });

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

  const [prUserRole, accountsRole, pmoRole, approvalsModule, prRequestModule] = await Promise.all([
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PR Request User" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Accounts" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Approvals" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "PR Request" } }),
  ]);
  const passwordHash = await hashPassword("PrSubj@12345");
  const make = async (label: string, roleId: string, roleName: string, modules: string[]) => {
    const user = await prisma.portalUser.create({
      data: { fullName: `PR Subject ${label}`, email: `${TAG}-${label.toLowerCase()}@example.com`, passwordHash, department: "PMO", roleId, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } },
    });
    fx.userIds.push(user.id);
    return { id: user.id, email: user.email, token: tokenFor(user, roleName) };
  };
  fx.requester = await make("Requester", prUserRole.id, prUserRole.name, [approvalsModule.id, prRequestModule.id]);
  fx.accounts = await make("Accounts", accountsRole.id, accountsRole.name, [approvalsModule.id]);
  fx.pmo = await make("PMO", pmoRole.id, pmoRole.name, [approvalsModule.id]);
});

after(async () => {
  setEmailTransportForTests(null);
  try {
    await prisma.project.deleteMany({ where: { prNo: { in: fx.prNos } } });
    await prisma.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
    await prisma.pRRequest.deleteMany({ where: { requestedByUserId: { in: fx.userIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: fx.userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: fx.userIds } } });
  } finally {
    await fx.close(); // always close the server, so a cleanup failure can never leave the test process hanging
  }
});

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
  const json = (await res.json().catch(() => ({}))) as { data?: { id: string; status?: string }; message?: string };
  return { status: res.status, json };
}

function projectData(prNo: string) {
  return {
    poMonth: "January 2026", prCategory: "India", prNo, client: CLIENT, department: "PMO", domesticForeign: "Domestic", projectTitle: TITLE, workOrderStatus: "Received",
    projectStartDate: "2026-01-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-01-01", rfqNo: "RFQ-TEST", eicName: "Test EIC", contractType: "LUMP SUM", pmoCoordinator: "Test Coordinator",
  };
}

/** The heading (<h2>) of a captured email, as a mail client displays it (tags dropped, entities decoded). */
function headingOf(html: string): string {
  const all = [...html.matchAll(/<h2 style="[^"]*">([^]*?)<\/h2>/g)];
  assert.equal(all.length, 1, "exactly one heading in the email");
  return all[0]![1]!.replace(/<[^>]+>/g, "").split("&nbsp;").join(" ").split("&lt;").join("<").split("&gt;").join(">").split("&quot;").join('"').split("&#39;").join("'").split("&amp;").join("&");
}

async function submit(prNo: string): Promise<string> {
  fx.prNos.push(prNo);
  const draft = await call("POST", "/pr-requests", fx.requester.token, { projectData: projectData(prNo) });
  assert.equal(draft.status, 201, draft.json.message);
  const id = draft.json.data!.id;
  const send = await call("POST", `/pr-requests/${id}/send-to-accounts`, fx.requester.token, { assignedAccountsApproverId: fx.accounts.id, assignedPmoManagerId: fx.pmo.id });
  assert.equal(send.status, 200, send.json.message);
  return id;
}

test("approved: subject and heading carry the FULL client and project title and no PR number; To is the requester only; the other two stage emails keep their subjects and recipients", async () => {
  sent = [];
  const prNo = `PR-${TAG}-A`;
  const id = await submit(prNo);
  assert.equal((await call("POST", `/pr-requests/${id}/accounts-approve`, fx.accounts.token, {})).status, 200);
  assert.equal((await call("POST", `/pr-requests/${id}/pmo-approve`, fx.pmo.token, {})).status, 200);

  const mail = await waitForMail(APPROVED);
  const expected = `${APPROVED} - ${CLIENT} - ${TITLE}`;
  assert.equal(mail.subject, expected);
  assert.equal(headingOf(mail.html), expected, "the heading is the same line as the subject");
  assert.ok(!mail.subject.includes(prNo) && !headingOf(mail.html).includes(prNo), "no PR number in the subject or the heading");
  assert.ok(mail.html.includes(`>${prNo}</td>`), "the PR Number row still shows it");
  assert.equal(mail.to, fx.requester.email, "still addressed to the original requester");
  assert.ok(mail.cc === undefined && mail.bcc === undefined, "no CC / BCC");
  assert.ok(mail.html.includes("&amp; Sons"), "the ampersand in the client is escaped in the markup");
  assert.match(mail.html, /Your PR Request has been fully approved and the Project has been created in the PMO Portal\./);

  // the two earlier stage emails were not touched
  const submitted = await waitForMail("New PR Request awaiting Accounts approval");
  assert.equal(submitted.subject, "New PR Request awaiting Accounts approval");
  assert.equal(submitted.to, fx.accounts.email);
  const awaitingPmo = await waitForMail("PR Request awaiting your approval");
  assert.equal(awaitingPmo.subject, "PR Request awaiting your approval");
  assert.equal(awaitingPmo.to, fx.pmo.email);
  for (const m of [submitted, awaitingPmo]) assert.ok(!/<h2\b/.test(m.html) && m.cc === undefined && m.bcc === undefined);
});

test("rejected: subject and heading carry the FULL client and project title and no PR number; the reason is escaped; To is the requester only", async () => {
  sent = [];
  const prNo = `PR-${TAG}-B`;
  const id = await submit(prNo);
  const reason = `Budget & scope "Q4" <b>over</b> limit`;
  assert.equal((await call("POST", `/pr-requests/${id}/reject`, fx.accounts.token, { reason })).status, 200);

  const mail = await waitForMail(REJECTED);
  const expected = `${REJECTED} - ${CLIENT} - ${TITLE}`;
  assert.equal(mail.subject, expected);
  assert.equal(headingOf(mail.html), expected, "the heading is the same line as the subject");
  assert.ok(!mail.subject.includes(prNo) && !headingOf(mail.html).includes(prNo), "no PR number in the subject or the heading");
  assert.ok(mail.html.includes(`>${prNo}</td>`), "the PR Number row still shows it");
  assert.equal(mail.to, fx.requester.email, "still addressed to the original requester");
  assert.ok(mail.cc === undefined && mail.bcc === undefined, "no CC / BCC");
  assert.ok(mail.html.includes(">Budget &amp; scope &quot;Q4&quot; &lt;b&gt;over&lt;/b&gt; limit</td>"), "the rejection reason is shown, escaped");
  assert.ok(!mail.html.includes("<b>over</b>"), "no raw markup from the reason");
  assert.match(mail.html, /Your PR Request was rejected by PR Subject Accounts\. No Project has been created for this request\./);
});
