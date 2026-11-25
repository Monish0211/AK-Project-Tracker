import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { after, before, test } from "node:test";
import nodemailer from "nodemailer";
import app from "../../app.js";
import { setEmailTransportForTests } from "../../shared/email/transporter.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * The mandatory CC on PR Request approval emails (Nov 2026), proved on the REAL workflow with the REAL mail library: every message goes through
 * Nodemailer over SMTP to a tiny mail server running inside this test on 127.0.0.1, which records the SMTP envelope (the addresses the message is
 * actually delivered to) and its To / Cc headers. Nothing leaves this machine. Set PR_CC_EVIDENCE=<file> to save what was captured.
 */

interface Captured { scenario: string; envelope: string[]; to: string; cc: string; subject: string }

const TAG = `prcc-${Date.now()}`;
const ARUN = "arun@ifluids.com";
const ARUN_ACCOUNT_EMAIL = "Arun@IFluids.com"; // the same mailbox written in another letter case on the portal account
const captured: Captured[] = [];
const refused = new Set<string>(); // addresses the test mail server refuses (lower case)
let scenario = "";
let sink: Server;
let url = "";
let closeApp: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], requests: [] as string[] };
const errors: string[] = [];
const realError = console.error;

function startSink(): Promise<number> {
  sink = createTcpServer((socket) => {
    let buffer = "", inData = false, envelope: string[] = [];
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ready");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const head = buffer.slice(0, end).split("\r\n\r\n")[0]!.replace(/\r\n[ \t]+/g, " ");
          const header = (name: string) => head.match(new RegExp(`^${name}: (.*)$`, "im"))?.[1] ?? "";
          captured.push({ scenario, envelope: [...envelope], to: header("To"), cc: header("Cc"), subject: header("Subject") });
          buffer = buffer.slice(end + 5); inData = false; envelope = [];
          reply("250 queued");
          continue;
        }
        const nl = buffer.indexOf("\r\n");
        if (nl < 0) return;
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 2);
        const command = line.toUpperCase();
        if (command.startsWith("EHLO") || command.startsWith("HELO")) reply("250 sink");
        else if (command.startsWith("RCPT TO")) {
          const address = line.match(/<([^>]*)>/)?.[1] ?? "";
          if (refused.has(address.toLowerCase())) reply("550 5.1.1 recipient refused");
          else { envelope.push(address); reply("250 ok"); }
        } else if (command === "DATA") { inData = true; reply("354 go ahead"); }
        else if (command === "QUIT") { reply("221 bye"); socket.end(); }
        else reply("250 ok");
      }
    });
  });
  return new Promise((resolve) => sink.listen(0, "127.0.0.1", () => resolve((sink.address() as AddressInfo).port)));
}

interface Actor { id: string; email: string; h: Record<string, string> }
async function makeUser(key: string, roleName: string, modules: string[], email = `${TAG}-${key}@example.com`): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const user = await prisma.portalUser.create({
    data: { fullName: `PrCc ${key}`, email, passwordHash: await hashPassword("PrCcTest@123"), department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) } },
  });
  created.users.push(user.id);
  return { id: user.id, email, h: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: user.id, email, roleId: role.id, roleName })}` } };
}
const api = async (actor: Actor, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: actor.h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};

/** Runs one action and returns the single email it sends (emails are fire-and-forget, so it waits for it, then makes sure no second one follows). */
async function oneEmail(label: string, action: () => Promise<{ status: number; message?: string | undefined }>): Promise<Captured> {
  scenario = label;
  const before = captured.length;
  const res = await action();
  assert.ok(res.status >= 200 && res.status < 300, `${label}: ${res.status} ${res.message}`);
  for (let i = 0; i < 100 && captured.length === before; i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(captured.length, before + 1, `${label}: exactly one email`);
  return captured.at(-1)!;
}
const list = (header: string) => header.split(",").map((a) => a.replace(/.*<|>.*/g, "").trim().toLowerCase()).filter(Boolean).sort();
const lower = (a: string[]) => a.map((x) => x.toLowerCase()).sort();
/** To is exactly `to`; CC is arun unless he is the To; the delivered envelope is those addresses, each once. */
function assertRecipients(mail: Captured, to: string) {
  const arunIsTo = to.toLowerCase() === ARUN;
  assert.deepEqual(list(mail.to), [to.toLowerCase()], `${mail.scenario}: To`);
  assert.deepEqual(list(mail.cc), arunIsTo ? [] : [ARUN], `${mail.scenario}: Cc`);
  assert.deepEqual(lower(mail.envelope), arunIsTo ? [ARUN] : [to.toLowerCase(), ARUN].sort(), `${mail.scenario}: delivered to`);
  assert.equal(mail.envelope.filter((a) => a.toLowerCase() === ARUN).length, 1, `${mail.scenario}: Arun exactly once`);
}

let seq = 0;
const projectData = () => {
  const prNo = `PR-${TAG}-${++seq}`;
  return { poMonth: "2026-11", prCategory: "India", prNo, rfqNo: `RFQ-${prNo}`, client: "CC Client", department: "PMO", domesticForeign: "Domestic", projectTitle: `CC ${prNo}`, workOrderStatus: "Received", projectStartDate: "2026-11-01", projectStatus: "Not Started", workOrderNumber: `WO-${prNo}`, workOrderDate: "2026-11-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name" };
};
async function draft(requester: Actor) {
  const res = await api(requester, "POST", "/pr-requests", { projectData: projectData() });
  assert.equal(res.status, 201, res.message);
  created.requests.push(res.data.id);
  return res.data.id as string;
}
const send = (requester: Actor, id: string, accounts: Actor, pmo: Actor) => () => api(requester, "POST", `/pr-requests/${id}/send-to-accounts`, { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id });
const statusOf = async (id: string) => prisma.pRRequest.findUniqueOrThrow({ where: { id }, select: { status: true, assignedAccountsApproverId: true, assignedPmoManagerId: true } });

let requester: Actor, accounts: Actor, accounts2: Actor, pmo: Actor, pmo2: Actor, arun: Actor, owner: Actor;

before(async () => {
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  const port = await startSink();
  setEmailTransportForTests(nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeApp = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  assert.equal(await prisma.portalUser.count({ where: { email: { equals: ARUN, mode: "insensitive" } } }), 0, "fixture: no account uses the address yet");
  requester = await makeUser("requester", "PR Request User", ["Approvals", "PR Request"]);
  accounts = await makeUser("accounts", "Accounts", ["Approvals"]);
  accounts2 = await makeUser("accounts2", "Accounts", ["Approvals"]);
  pmo = await makeUser("pmo", "PMO Manager", ["Approvals", "Projects"]);
  pmo2 = await makeUser("pmo2", "PMO Manager", ["Approvals", "Projects"]);
  arun = await makeUser("arun", "PMO Manager", ["Approvals", "Projects", "PR Request"], ARUN_ACCOUNT_EMAIL);
  owner = await makeUser("owner", "Administrator", ["Approvals", "Projects"]);
  process.env["ADMIN_CONTROLS_OWNER_EMAILS"] = owner.email;
});

after(async () => {
  console.error = realError;
  setEmailTransportForTests(null);
  delete process.env["ADMIN_CONTROLS_OWNER_EMAILS"];
  try {
    if (process.env["PR_CC_EVIDENCE"]) writeFileSync(process.env["PR_CC_EVIDENCE"], JSON.stringify(captured, null, 2));
    const projects = await prisma.project.findMany({ where: { prNo: { contains: TAG } }, select: { id: true } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: created.requests } } });
    await prisma.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });
    await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeApp();
    sink.close();
  }
});

test("another PMO Manager: submitted, cleared Accounts and approved each go to the usual person with Arun in CC; routing is unchanged", async () => {
  const id = await draft(requester);
  assertRecipients(await oneEmail("submitted to Accounts", send(requester, id, accounts, pmo)), accounts.email);
  assert.deepEqual(await statusOf(id), { status: "Pending Accounts Approval", assignedAccountsApproverId: accounts.id, assignedPmoManagerId: pmo.id });
  assert.equal((await api(pmo, "POST", `/pr-requests/${id}/accounts-approve`, {})).status, 403, "only the assigned Accounts approver");
  assert.equal((await api(arun, "POST", `/pr-requests/${id}/accounts-approve`, {})).status, 403, "being copied gives no approval right");
  assertRecipients(await oneEmail("cleared Accounts, to PMO Manager", () => api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {})), pmo.email);
  assert.equal((await api(arun, "POST", `/pr-requests/${id}/pmo-approve`, {})).status, 403);
  assertRecipients(await oneEmail("approved, to requester", () => api(pmo, "POST", `/pr-requests/${id}/pmo-approve`, {})), requester.email);
  assert.equal((await statusOf(id)).status, "Approved");
});

test("rejected at Accounts and at PMO Manager: the requester, with Arun in CC", async () => {
  const first = await draft(requester);
  await oneEmail("setup", send(requester, first, accounts, pmo));
  assertRecipients(await oneEmail("rejected by Accounts", () => api(accounts, "POST", `/pr-requests/${first}/reject`, { reason: "Not complete" })), requester.email);
  const second = await draft(requester);
  await oneEmail("setup", send(requester, second, accounts, pmo2));
  await oneEmail("cleared Accounts (second PMO Manager)", () => api(accounts, "POST", `/pr-requests/${second}/accounts-approve`, {}));
  assert.deepEqual(list(captured.at(-1)!.cc), [ARUN], "a different PMO Manager keeps the CC");
  assertRecipients(await oneEmail("rejected by PMO Manager", () => api(pmo2, "POST", `/pr-requests/${second}/reject`, { reason: "Budget" })), requester.email);
});

test("Arun is the selected PMO Manager (address in another letter case): he stays PMO Manager, receives each email once, never twice in one", async () => {
  const id = await draft(requester);
  assertRecipients(await oneEmail("submitted, Arun is PMO Manager", send(requester, id, accounts, arun)), accounts.email);
  const mail = await oneEmail("cleared Accounts, to Arun as PMO Manager", () => api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {}));
  assertRecipients(mail, ARUN_ACCOUNT_EMAIL);
  assert.equal(mail.envelope.length, 1);
  assert.equal((await statusOf(id)).assignedPmoManagerId, arun.id);
  assertRecipients(await oneEmail("approved by Arun", () => api(arun, "POST", `/pr-requests/${id}/pmo-approve`, {})), requester.email);
});

test("Arun as Accounts approver or as requester: he is the To and is not copied again", async () => {
  const asAccounts = await draft(requester);
  assertRecipients(await oneEmail("submitted, Arun is Accounts approver", send(requester, asAccounts, arun, pmo)), ARUN_ACCOUNT_EMAIL);
  const asRequester = await draft(arun);
  await oneEmail("setup", send(arun, asRequester, accounts, pmo));
  assertRecipients(await oneEmail("rejected, Arun is the requester", () => api(accounts, "POST", `/pr-requests/${asRequester}/reject`, { reason: "Duplicate" })), ARUN_ACCOUNT_EMAIL);
});

test("RESEND: an administrator reassigning the Accounts approver or the PMO Manager sends the notification again, with Arun in CC; administrative approval keeps it", async () => {
  const id = await draft(requester);
  await oneEmail("setup", send(requester, id, accounts, pmo));
  const reassign = (body: Record<string, string>) => () => api(owner, "POST", `/pr-requests/${id}/admin/reassign`, { ...body, reason: "Cover for leave" });
  assertRecipients(await oneEmail("resent after Accounts approver changed", reassign({ assignedAccountsApproverId: accounts2.id })), accounts2.email);
  assertRecipients(await oneEmail("administrator approves Accounts stage", () => api(owner, "POST", `/pr-requests/${id}/admin/approve`, { reason: "Cover for leave" })), pmo.email);
  assertRecipients(await oneEmail("resent after PMO Manager changed", reassign({ assignedPmoManagerId: pmo2.id })), pmo2.email);
  assertRecipients(await oneEmail("resent after PMO Manager changed to Arun", reassign({ assignedPmoManagerId: arun.id })), ARUN_ACCOUNT_EMAIL);
  assertRecipients(await oneEmail("administrator rejects", () => api(owner, "POST", `/pr-requests/${id}/admin/reject`, { reason: "Cancelled by client" })), requester.email);
});

test("FAILURE: if Arun's address is refused the usual recipient still gets the email; if the usual recipient is refused Arun still gets it and the failure is logged", async () => {
  try {
    refused.add(ARUN);
    const id = await draft(requester);
    const mail = await oneEmail("Arun's address refused by the server", send(requester, id, accounts, pmo));
    assert.deepEqual(lower(mail.envelope), [accounts.email.toLowerCase()]);
    assert.ok(errors.some((e) => /Submitted email .*refused .*arun@ifluids\.com/i.test(e) && !/did NOT receive/.test(e)), errors.slice(-3).join(" | "));
    refused.clear();
    refused.add(pmo.email.toLowerCase());
    const second = await oneEmail("PMO Manager's address refused by the server", () => api(accounts, "POST", `/pr-requests/${id}/accounts-approve`, {}));
    assert.deepEqual(lower(second.envelope), [ARUN]);
    assert.ok(errors.some((e) => /Accounts Approved email .*did NOT receive/.test(e)), errors.slice(-3).join(" | "));
    assert.equal((await statusOf(id)).status, "Pending PMO Manager Approval", "the approval itself is never affected by email");
    // both refused: the send fails, is logged as before, and the workflow still advances
    refused.add(ARUN);
    refused.add(requester.email.toLowerCase());
    const before = captured.length;
    assert.equal((await api(pmo, "POST", `/pr-requests/${id}/reject`, { reason: "Both refused" })).status, 200);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(captured.length, before);
    assert.ok(errors.some((e) => /Rejected email failed for/.test(e)));
    assert.equal((await statusOf(id)).status, "Rejected");
  } finally {
    refused.clear();
  }
});

test("UNRELATED email is untouched: a password reset goes only to its own user", async () => {
  const mail = await oneEmail("unrelated: password reset", () => api(requester, "POST", "/auth/forgot-password", { email: requester.email }));
  assert.deepEqual([list(mail.to), list(mail.cc), lower(mail.envelope)], [[requester.email.toLowerCase()], [], [requester.email.toLowerCase()]]);
});
