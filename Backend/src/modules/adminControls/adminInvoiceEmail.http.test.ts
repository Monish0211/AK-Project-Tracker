import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { setEmailTransportForTests } from "../../shared/email/transporter.js";
import { notifyInvoicePaidIfLinked } from "../invoiceRequests/services/invoiceRequest.service.js";
import { settleInvoiceViaPayment } from "../invoicePayments/settleInvoice.testutil.js";

/**
 * Administrative Controls - "Raise invoice without sending email" (Nov 2026 fixes), over real HTTP + the scratch database. A capture-only mail
 * transport is installed: nothing can reach a real mailbox; the captured list proves which automatic emails were (not) built.
 *  - Draft -> Raised (PATCH) with suppression: no "Invoice Raised" email, request fulfilled, in-app notice kept, recorded on the invoice's
 *    status history (EMAIL_SUPPRESSED) and on the request (raisedEmailStatus "suppressed").
 *  - Only an Invoice Administration holder may suppress (403 otherwise, nothing written).
 *  - Retried / duplicate / concurrent raises record ONE suppression event.
 *  - Several lines raised in one save: one event per raised line, the request fulfilled once, no email.
 *  - Financial figures and the GST snapshot are identical with and without suppression.
 *  - Draft -> Paid: refused by the payment workflow (with or without suppression) - no email; the Paid notifier itself honours suppression;
 *    a normal payment still sends the Invoice Paid email.
 *  - Invoice Tracker shows the suppression event and the request's email outcome.
 */

const TAG = `admmail-${Date.now()}`;
const sent: { to: string; subject: string }[] = [];
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
type U = { id: string; email: string; headers: Record<string, string>; authorization: string };
const people: Record<string, U> = {};

const raisedEmails = () => sent.filter((m) => /raised/i.test(m.subject) && !/paid/i.test(m.subject));
const paidEmails = () => sent.filter((m) => /paid/i.test(m.subject));
const settle = async (ms = 400) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await settle(100);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

async function makeUser(key: string, roleName: string, approvals: string[]): Promise<U> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Projects", "Invoices"] } } });
  const types = await prisma.approvalType.findMany({ where: { name: { in: approvals } } });
  const email = `${TAG}-${key}@example.com`;
  const u = await prisma.portalUser.create({
    data: {
      fullName: `AdmMail ${key}`, email, passwordHash: await hashPassword("AdmMail@123"), department: "Accounts", roleId: role.id, forcePasswordChange: false,
      allCountriesAccess: true,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      approvalPermissions: { create: types.map((t) => ({ approvalTypeId: t.id })) },
    },
  });
  created.users.push(u.id);
  const authorization = `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}`;
  return { id: u.id, email, authorization, headers: { "Content-Type": "application/json", Authorization: authorization } };
}

const call = async (who: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: people[who]!.headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};

async function makeProject(suffix: string, opts: { gst?: boolean } = {}) {
  const p = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: "India", prNo: `${TAG}-${suffix}`, client: "AdmMail Client", department: "Process", domesticForeign: "Domestic",
      projectTitle: `AdmMail ${suffix}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
      gstApplicable: opts.gst ?? false, createdByUserId: null,
    },
  });
  created.projects.push(p.id);
  const qi = await prisma.quantityItem.create({ data: { projectId: p.id, description: "Item", woQty: 100, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 10_000_000 } });
  return { id: p.id, qi: qi.id };
}
const openRequest = (projectId: string) =>
  prisma.invoiceRequest.create({ data: { projectId, requestedByUserId: people.requester!.id, assignedToUserId: people.holder!.id, status: "Open" } });
const createLine = (who: string, qi: string, invoiceNo: string, extra: Record<string, unknown> = {}) =>
  call(who, "POST", `/quantity/${qi}/invoice-lines`, { invoiceNo, invoiceIntent: "new", invoiceDate: "2026-11-10", quantityBilled: 0, invoiceAmountINR: 1000, status: "Draft", ...extra });
const resend = (line: { invoiceNo: string; invoiceDate: string; quantityBilled: number; invoiceAmountINR: number }, overrides: Record<string, unknown>) => ({
  invoiceNo: line.invoiceNo, invoiceDate: line.invoiceDate.slice(0, 10), quantityBilled: line.quantityBilled, invoiceAmountINR: line.invoiceAmountINR, ...overrides,
});
const suppressionEvents = (lineId: string) => prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: lineId, eventType: "EMAIL_SUPPRESSED" } });

before(async () => {
  setEmailTransportForTests({ sendMail: async (m: { to?: unknown; subject?: unknown }) => { sent.push({ to: String(m.to), subject: String(m.subject) }); return {} as never; } } as never);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  people.holder = await makeUser("holder", "Administrator", ["Raise Invoice", "Edit Invoice", "Delete Invoice", "Invoice Administration"]);
  people.plain = await makeUser("plain", "Engineer", ["Raise Invoice", "Edit Invoice", "Delete Invoice"]);
  people.requester = await makeUser("requester", "Engineer", []);
});

after(async () => {
  setEmailTransportForTests(null);
  await closeServer();
  await prisma.invoicePaymentEvent.deleteMany({ where: { projectId: { in: created.projects } } });
  await prisma.invoicePayment.deleteMany({ where: { projectId: { in: created.projects } } }).catch(() => undefined);
  await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: created.projects } } });
  await prisma.invoiceStatusEvent.deleteMany({ where: { projectId: { in: created.projects } } });
  const items = await prisma.quantityItem.findMany({ where: { projectId: { in: created.projects } }, select: { id: true } });
  await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
  await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: created.projects } } });
  for (const id of created.projects) await prisma.project.delete({ where: { id } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: created.users } } });
  for (const id of created.users) await prisma.portalUser.delete({ where: { id } }).catch(() => undefined);
});

test("Draft -> Raised with suppression: no Raised email, request fulfilled, in-app notice kept, recorded on the invoice and on the request", async () => {
  const P = await makeProject("DR");
  const req = await openRequest(P.id);
  const draft = (await createLine("holder", P.qi, `${TAG}-DR1`, { suppressEmail: true })).data;
  assert.equal(draft.status, "Draft");
  assert.equal((await suppressionEvents(draft.id)).length, 0, "a Draft creation raises nothing - no suppression is recorded");
  sent.length = 0;

  const raised = await call("holder", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Raised", suppressEmail: true }));
  assert.equal(raised.status, 200, raised.message);
  await until(async () => (await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } })).raisedEmailStatus !== null, "request outcome");
  await settle();
  const r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(r.status, "Completed");
  assert.equal(r.fulfilledInvoiceLineId, draft.id);
  assert.equal(r.raisedEmailStatus, "suppressed");
  assert.match(r.raisedEmailDetail ?? "", /AdmMail holder raised the invoice without email/);
  assert.equal(r.emailStatus, null, "the assignment email's own status is never overwritten");
  assert.equal(raisedEmails().length, 0, "no Invoice Raised Successfully email was built");
  assert.equal(await prisma.notification.count({ where: { userId: people.requester!.id, type: "INVOICE_REQUEST_FULFILLED" } }), 1, "in-app notice kept");

  const ev = await suppressionEvents(draft.id);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0]!.fromStatus, ev[0]!.toStatus, ev[0]!.actorUserId, ev[0]!.actorName, ev[0]!.invoiceNo, ev[0]!.source], ["Raised", "Raised", people.holder!.id, "AdmMail holder", `${TAG}-DR1`, "invoice_update"]);
  const details = ev[0]!.details as { operation: string; emailsSuppressed: string[]; invoiceRequestIds: string[] };
  assert.equal(details.operation, "Raised");
  assert.deepEqual(details.emailsSuppressed, ["Invoice Raised Successfully"]);
  assert.deepEqual(details.invoiceRequestIds, [req.id], "the related Invoice Request is recorded");
  assert.ok(ev[0]!.occurredAt instanceof Date);

  // Retrying the same raise (already Raised) records nothing new and sends nothing.
  assert.equal((await call("holder", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Raised", suppressEmail: true }))).status, 200);
  await settle();
  assert.equal((await suppressionEvents(draft.id)).length, 1, "a retry never duplicates the suppression event");
  assert.equal(raisedEmails().length, 0);
});

test("only an Invoice Administration holder may suppress: a direct API attempt is 403 and changes nothing", async () => {
  const P = await makeProject("NA");
  const draft = (await createLine("plain", P.qi, `${TAG}-NA1`)).data;
  assert.equal((await createLine("plain", P.qi, `${TAG}-NA2`, { status: "Raised", suppressEmail: true })).status, 403);
  assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: `${TAG}-NA2` } }), 0, "create refused before anything is written");
  const patch = await call("plain", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Raised", suppressEmail: true }));
  assert.equal(patch.status, 403);
  assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.id } })).status, "Draft", "update refused, still a Draft");
  assert.equal((await suppressionEvents(draft.id)).length, 0);
});

test("concurrent duplicate raises with suppression record ONE suppression event", async () => {
  const P = await makeProject("CC");
  const draft = (await createLine("holder", P.qi, `${TAG}-CC1`)).data;
  const results = await Promise.all([1, 2, 3].map(() => call("holder", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Raised", suppressEmail: true }))));
  assert.ok(results.every((x) => x.status === 200));
  assert.equal((await suppressionEvents(draft.id)).length, 1);
});

test("several lines raised in one save: one event per raised line, the request fulfilled once, no email", async () => {
  const P = await makeProject("ML");
  const req = await openRequest(P.id);
  sent.length = 0;
  const a = await createLine("holder", P.qi, `${TAG}-ML1`, { status: "Raised", suppressEmail: true });
  const b = await createLine("holder", P.qi, `${TAG}-ML1`, { status: "Raised", suppressEmail: true, invoiceIntent: "existing", invoiceAmountINR: 500 });
  assert.equal(a.status, 201, a.message);
  assert.equal(b.status, 201, b.message);
  await until(async () => (await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } })).raisedEmailStatus !== null, "request outcome");
  await settle();
  assert.equal((await suppressionEvents(a.data.id)).length, 1);
  assert.equal((await suppressionEvents(b.data.id)).length, 1);
  const r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.deepEqual([r.status, r.fulfilledInvoiceLineId, r.raisedEmailStatus], ["Completed", a.data.id, "suppressed"]);
  assert.equal(raisedEmails().length, 0);
});

test("financial figures and the GST snapshot are identical with and without suppression; a normal raise still emails", async () => {
  const P1 = await makeProject("F1", { gst: true });
  const P2 = await makeProject("F2", { gst: true });
  const req2 = await openRequest(P2.id);
  const gst = { applicable: true, ratePercent: 18, taxType: "CGST_SGST", buyerStateKnown: true };
  sent.length = 0;
  const quiet = await createLine("holder", P1.qi, `${TAG}-F1`, { status: "Raised", invoiceAmountINR: 90000, gst, suppressEmail: true });
  const loud = await createLine("holder", P2.qi, `${TAG}-F2`, { status: "Raised", invoiceAmountINR: 90000, gst });
  assert.equal(quiet.status, 201, quiet.message);
  assert.equal(loud.status, 201, loud.message);
  const [lq, ll] = await Promise.all([prisma.invoiceLine.findUniqueOrThrow({ where: { id: quiet.data.id } }), prisma.invoiceLine.findUniqueOrThrow({ where: { id: loud.data.id } })]);
  const pick = (l: typeof lq) => [l.status, l.invoiceAmountINR, l.calculatedAmountINR, l.unitPriceINR, l.commercialAdjustmentINR, l.currency, l.exchangeRateToINR, l.quantityBilled];
  assert.deepEqual(pick(lq), pick(ll));
  const snap = async (no: string) => {
    const s = await prisma.invoiceGstSnapshot.findFirstOrThrow({ where: { invoiceNumber: { normalizedInvoiceNo: no.toUpperCase() } } });
    return [s.gstStatus, String(s.ratePercent), s.taxType, String(s.taxableAmount), String(s.cgstAmount), String(s.sgstAmount), String(s.gstAmount), String(s.totalAmount)];
  };
  assert.deepEqual(await snap(`${TAG}-F1`), await snap(`${TAG}-F2`));
  await until(async () => (await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req2.id } })).raisedEmailStatus !== null, "normal outcome");
  assert.equal(raisedEmails().length, 1, "the normal raise sent its Invoice Raised email");
  assert.equal((await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req2.id } })).raisedEmailStatus, "sent");
  assert.equal((await suppressionEvents(loud.data.id)).length, 0, "nothing recorded for a normal raise");
});

test("Draft -> Paid: refused by the payment workflow, with or without suppression, and no email is sent", async () => {
  const P = await makeProject("DP");
  await openRequest(P.id);
  const draft = (await createLine("holder", P.qi, `${TAG}-DP1`)).data;
  sent.length = 0;
  assert.equal((await call("holder", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Paid", suppressEmail: true }))).status, 409);
  assert.equal((await call("holder", "PATCH", `/invoice-lines/${draft.id}`, resend(draft, { status: "Paid" }))).status, 409);
  await settle();
  assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: draft.id } })).status, "Draft");
  assert.equal(sent.length, 0);
  assert.equal((await suppressionEvents(draft.id)).length, 0);
});

test("the Invoice Paid notifier honours suppression (safeguard); a normal payment still sends the Invoice Paid email", async () => {
  const P = await makeProject("PN");
  const req = await openRequest(P.id);
  const line = (await createLine("holder", P.qi, `${TAG}-PN1`, { status: "Raised" })).data;
  await until(async () => (await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } })).fulfilledInvoiceLineId === line.id, "fulfilment");
  sent.length = 0;
  await notifyInvoicePaidIfLinked(line.id, { invoiceNo: line.invoiceNo, invoiceAmountINR: 1000 }, { suppressEmail: true, actorName: "AdmMail holder" });
  assert.equal(paidEmails().length, 0, "suppressed: no Invoice Paid email");
  let r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(r.finalEmailStatus, "suppressed");
  assert.equal(await prisma.notification.count({ where: { userId: people.requester!.id, type: "INVOICE_PAID" } }), 1, "in-app notice kept");

  // Normal payment processing: unchanged - the Invoice Paid email goes out.
  const pay = await settleInvoiceViaPayment({ url, authorization: people.holder!.authorization, userId: people.holder!.id, projectId: P.id, invoiceNo: line.invoiceNo });
  assert.equal(pay.status, 201, JSON.stringify(pay.body).slice(0, 200));
  await until(async () => paidEmails().length > 0, "paid email");
  r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } });
  assert.equal(r.finalEmailStatus, "sent");
});

test("Invoice Tracker shows the suppression on the invoice's history and the request's email outcome", async () => {
  const P = await makeProject("TK");
  const req = await openRequest(P.id);
  const line = await createLine("holder", P.qi, `${TAG}-TK1`, { status: "Raised", suppressEmail: true });
  await until(async () => (await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: req.id } })).raisedEmailStatus !== null, "outcome");
  const view = await call("holder", "GET", `/invoice-tracker/projects/${P.id}/invoices?month=2026-11`);
  assert.equal(view.status, 200, view.message);
  const inv = view.data.invoices.find((i: { invoiceNo: string }) => i.invoiceNo === `${TAG}-TK1`);
  assert.ok(inv.timeline.some((e: { eventType: string }) => e.eventType === "EMAIL_SUPPRESSED"), "history shows the suppression");
  assert.equal(inv.raisedAt !== undefined, true);
  const rq = view.data.requests.find((x: { fulfilledByInvoiceNo: string | null }) => x.fulfilledByInvoiceNo === `${TAG}-TK1`);
  assert.equal(rq.raisedEmailStatus, "suppressed");
  assert.equal(line.status, 201);
});
