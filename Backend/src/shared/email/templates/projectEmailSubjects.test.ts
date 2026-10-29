import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { InvoicePaidEmailData, PRRequestApprovedEmailData, PRRequestRejectedEmailData } from "../email.types.js";
import {
  buildInvoicePaidSubject,
  buildPRRequestApprovedSubject,
  buildPRRequestRejectedSubject,
  INVOICE_PAID_HEADING_PREFIX,
  PR_REQUEST_APPROVED_HEADING_PREFIX,
  PR_REQUEST_REJECTED_HEADING_PREFIX,
  renderPRRequestApprovedHeading,
} from "./invoiceEmailHeading.js";
import { buildInvoicePaidEmail } from "./invoicePaid.template.js";
import { buildInvoiceSharedEmail } from "./invoiceShared.template.js";
import { buildPRRequestAccountsApprovedEmail } from "./prRequestAccountsApproved.template.js";
import { buildPRRequestApprovedEmail } from "./prRequestApproved.template.js";
import { buildPRRequestRejectedEmail } from "./prRequestRejected.template.js";
import { buildPRRequestSubmittedEmail } from "./prRequestSubmitted.template.js";

/**
 * Subject AND body heading of three emails (Oct 2026), each pair being one and the same text:
 *   Invoice Paid                                              - {client, first 3 words} - {project title, first 3 words} - {full PR number}
 *   Your PR Request has been approved — Project created       - {full client name} - {full project title}        (no PR number)
 *   Your PR Request has been rejected                         - {full client name} - {full project title}        (no PR number)
 * Pure tests: no database, no network, no mail transport.
 */

const URL_ = "https://pmodashboard.ifluids.in/projects/edit/p-1";
const CLIENT = "HTH Technology Co Private Limited";
const TITLE = "3D F&G Mapping Services Project";
const EVIL = "<b>ZZ</b>";
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const NEL = String.fromCharCode(133);
const LS = String.fromCharCode(8232);

const paid = (over: Partial<InvoicePaidEmailData> = {}): InvoicePaidEmailData => ({
  requesterName: "Asha Rao", prNo: "PR-12073", projectTitle: TITLE, client: CLIENT, invoiceNo: "INV-001", invoiceAmountINR: 100000, invoicesUrl: URL_, ...over,
});
const approved = (over: Partial<PRRequestApprovedEmailData> = {}): PRRequestApprovedEmailData => ({
  requesterName: "Ravi Kumar", prNo: "PR-12073", projectTitle: TITLE, client: CLIENT, projectUrl: URL_, ...over,
});
const rejected = (over: Partial<PRRequestRejectedEmailData> = {}): PRRequestRejectedEmailData => ({
  requesterName: "Ravi Kumar", rejectedByName: "PMO Manager", prNo: "PR-12073", projectTitle: TITLE, client: CLIENT, reason: "Budget not approved for this quarter.", ...over,
});

/** The heading element as a mail client displays it (tags dropped, entities decoded, a non-breaking space looks like a space). Fails if there is not exactly one. */
const decode = (s: string): string =>
  s.replace(/<[^>]+>/g, "").split("&nbsp;").join(" ").split("&lt;").join("<").split("&gt;").join(">").split("&quot;").join('"').split("&#39;").join("'").split("&amp;").join("&");
function headingOf(html: string): string {
  const all = [...html.matchAll(/<h2 style="[^"]*">([^]*?)<\/h2>/g)];
  assert.equal(all.length, 1, "exactly one heading in the email");
  return decode(all[0]![1]!);
}
/** The markup between the heading's own <h2> tags. */
const headingMarkup = (html: string): string => [...html.matchAll(/<h2 style="[^"]*">([^]*?)<\/h2>/g)][0]![1]!;
const kept = (text: string): string => `<span style="white-space:nowrap;">${text}</span>`;
const isOneCleanLine = (s: string): boolean => [...s].every((ch) => { const c = ch.charCodeAt(0); return c > 31 && !(c >= 127 && c <= 159) && c !== 8232 && c !== 8233; });

const APPROVED_PREFIX = "Your PR Request has been approved — Project created";
const REJECTED_PREFIX = "Your PR Request has been rejected";

// ------------------------------------------------------------------------------------------------------------------------------------------
// the requested examples
// ------------------------------------------------------------------------------------------------------------------------------------------

test("the three examples from the requirement, exactly — subject and body heading are the same text", () => {
  const p = buildInvoicePaidEmail(paid());
  assert.equal(p.subject, "Invoice Paid - HTH Technology Co - 3D F&G Mapping - PR-12073");
  assert.equal(headingOf(p.html), p.subject);

  const a = buildPRRequestApprovedEmail(approved());
  assert.equal(a.subject, "Your PR Request has been approved — Project created - HTH Technology Co Private Limited - 3D F&G Mapping Services Project");
  assert.equal(headingOf(a.html), a.subject);

  const r = buildPRRequestRejectedEmail(rejected());
  assert.equal(r.subject, "Your PR Request has been rejected - HTH Technology Co Private Limited - 3D F&G Mapping Services Project");
  assert.equal(headingOf(r.html), r.subject);
});

test("the prefixes are the requested wording", () => {
  assert.equal(INVOICE_PAID_HEADING_PREFIX, "Invoice Paid");
  assert.equal(PR_REQUEST_APPROVED_HEADING_PREFIX, APPROVED_PREFIX);
  assert.equal(PR_REQUEST_REJECTED_HEADING_PREFIX, REJECTED_PREFIX);
});

test("the old fixed / differently formatted subjects are gone", () => {
  const subjects = [buildInvoicePaidEmail(paid()).subject, buildPRRequestApprovedEmail(approved()).subject, buildPRRequestRejectedEmail(rejected()).subject];
  assert.ok(!subjects[0]!.includes(" / "), "no 'title / PR' format any more");
  assert.notEqual(subjects[1], "Your PR Request has been approved — Project created");
  assert.notEqual(subjects[2], "Your PR Request has been rejected");
  const keys = Object.keys(EMAIL_SUBJECTS);
  for (const gone of ["INVOICE_PAID", "PR_REQUEST_APPROVED", "PR_REQUEST_REJECTED"]) assert.ok(!keys.includes(gone), `${gone} is built per email now`);
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// Invoice Paid: first three words, full PR number
// ------------------------------------------------------------------------------------------------------------------------------------------

test("Invoice Paid: first three words of the client and of the project title; the full PR number including suffixes", () => {
  const e = buildInvoicePaidEmail(paid({ client: "HTH Technology Co Private Limited", projectTitle: "3D F&G Mapping Services Project", prNo: "PR-12073-REV2" }));
  assert.equal(e.subject, "Invoice Paid - HTH Technology Co - 3D F&G Mapping - PR-12073-REV2");
  assert.equal(headingOf(e.html), e.subject);
  assert.equal(buildInvoicePaidSubject({ client: "Hindustan Petroleum Corporation Limited India", projectTitle: "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion", prNo: "PR-12073-A Rev 2 final copy" }),
    "Invoice Paid - Hindustan Petroleum Corporation - Quantitative Risk Assessment - PR-12073-A Rev 2 final copy");
  assert.equal(buildInvoicePaidSubject({ client: "Al-Rashid Oil-Gas Co Ltd", projectTitle: "Pre-FEED Study of Lines", prNo: "PR-5" }), "Invoice Paid - Al-Rashid Oil-Gas Co - Pre-FEED Study of - PR-5", "hyphenated words count as one");
});

test("Invoice Paid: the details table still shows the FULL client, project title and PR number; heading above the greeting; the rest of the body is as before", () => {
  const e = buildInvoicePaidEmail(paid({ prNo: "PR-12073-REV2" }));
  assert.ok(e.html.includes(`>${CLIENT}</td>`) && e.html.includes(">3D F&amp;G Mapping Services Project</td>") && e.html.includes(">PR-12073-REV2</td>"), "full values in the table");
  assert.ok(e.html.indexOf("<h2") > 0 && e.html.indexOf("<h2") < e.html.indexOf("Hello Asha Rao,"), "heading precedes the greeting");
  assert.match(e.html, /The invoice below has been marked as Paid\./);
  for (const label of ["Invoice No", "Invoice Amount", "Status", "PR Number", "Project Title", "Client"]) assert.ok(e.html.includes(`>${label}</td>`), `row "${label}" present`);
  assert.ok(e.html.includes(">INV-001</td>") && e.html.includes(">Paid</td>"));
  assert.match(e.html, /Open Project Invoices/);
  assert.ok(e.html.includes(`href="${URL_}"`), "button link unchanged");
  assert.ok(e.html.includes("Invoice INV-001 for 3D F&amp;G Mapping Services Project has been paid."), "preview text unchanged (full title), escaped once");
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// PR Request approved / rejected: full values, no PR number
// ------------------------------------------------------------------------------------------------------------------------------------------

test("approved / rejected: the FULL client name and the FULL project title are used — never cut to three words", () => {
  const client = "Hindustan Petroleum Corporation Limited India Private Division";
  const title = "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion Phase Two";
  const a = buildPRRequestApprovedEmail(approved({ client, projectTitle: title }));
  const r = buildPRRequestRejectedEmail(rejected({ client, projectTitle: title }));
  assert.equal(a.subject, `${APPROVED_PREFIX} - ${client} - ${title}`);
  assert.equal(r.subject, `${REJECTED_PREFIX} - ${client} - ${title}`);
  assert.equal(headingOf(a.html), a.subject);
  assert.equal(headingOf(r.html), r.subject);
});

test("approved / rejected: the PR number is NOT in the subject or the heading — it stays in the details table", () => {
  for (const [e, name] of [[buildPRRequestApprovedEmail(approved({ prNo: "PR-12073-REV2" })), "approved"], [buildPRRequestRejectedEmail(rejected({ prNo: "PR-12073-REV2" })), "rejected"]] as const) {
    assert.ok(!e.subject.includes("PR-12073"), `${name}: not in the subject`);
    assert.ok(!headingOf(e.html).includes("PR-12073"), `${name}: not in the heading`);
    assert.ok(!/PR-\d/.test(e.subject), `${name}: no PR-style number in the subject`);
    assert.ok(e.html.includes(">PR-12073-REV2</td>"), `${name}: the PR Number row still shows it`);
  }
});

test("approved / rejected: the existing body, details table, button and reason are preserved", () => {
  const a = buildPRRequestApprovedEmail(approved());
  assert.match(a.html, /Hello Ravi Kumar,/);
  assert.match(a.html, /Your PR Request has been fully approved and the Project has been created in the PMO Portal\./);
  assert.ok(a.html.includes(">PR Number</td>") && a.html.includes(">Project Title</td>") && a.html.includes(">3D F&amp;G Mapping Services Project</td>"));
  assert.ok(!a.html.includes(">Client</td>"), "no new Client row was added to the approved email's table");
  assert.match(a.html, /View Project/);
  assert.ok(a.html.includes(`href="${URL_}"`));
  assert.ok(a.html.includes("PR Request PR-12073 approved — Project created."), "preview text unchanged");
  assert.ok(a.html.indexOf("<h2") < a.html.indexOf("Hello Ravi Kumar,"), "heading above the greeting");

  const r = buildPRRequestRejectedEmail(rejected());
  assert.match(r.html, /Hello Ravi Kumar,/);
  assert.match(r.html, /Your PR Request was rejected by PMO Manager\. No Project has been created for this request\./);
  assert.match(r.html, /If you believe this was rejected in error, please contact PMO Manager directly\./);
  assert.ok(r.html.includes(">Reason</td>") && r.html.includes(">Budget not approved for this quarter.</td>"), "the rejection reason is shown");
  assert.ok(!r.html.includes(">Client</td>"), "no new Client row was added to the rejected email's table");
  assert.ok(r.html.includes("PR Request PR-12073 was rejected."), "preview text unchanged");
  assert.ok(r.html.indexOf("<h2") < r.html.indexOf("Hello Ravi Kumar,"));
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// short names, whitespace, punctuation, missing values, long names
// ------------------------------------------------------------------------------------------------------------------------------------------

test("short names, extra whitespace, punctuation, missing and long values: subject and heading stay the same safe line", () => {
  const long = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu";
  const cases: { name: string; client: string; title: string; prNo: string; paid: string; full: (prefix: string) => string }[] = [
    { name: "short", client: "A", title: "B", prNo: "PR-1", paid: "Invoice Paid - A - B - PR-1", full: (p) => `${p} - A - B` },
    { name: "whitespace", client: "  HTH   Technology\tCo\n Private ", title: "\n 3D  F&G   Mapping \r\n Services", prNo: " PR-12073 ", paid: "Invoice Paid - HTH Technology Co - 3D F&G Mapping - PR-12073", full: (p) => `${p} - HTH Technology Co Private - 3D F&G Mapping Services` },
    { name: "missing client", client: "", title: "Only Title Here", prNo: "PR-9", paid: "Invoice Paid - Only Title Here - PR-9", full: (p) => `${p} - Only Title Here` },
    { name: "missing title", client: "Only Client", title: "   ", prNo: "PR-9", paid: "Invoice Paid - Only Client - PR-9", full: (p) => `${p} - Only Client` },
    { name: "missing everything", client: "", title: "", prNo: "", paid: "Invoice Paid", full: (p) => p },
    { name: "punctuation", client: `Tata & Sons "Ltd" India`, title: `O'Brien's <unit> A B`, prNo: "PR-1", paid: `Invoice Paid - Tata & Sons - O'Brien's <unit> A - PR-1`, full: (p) => `${p} - Tata & Sons "Ltd" India - O'Brien's <unit> A B` },
    { name: "long names", client: long, title: long, prNo: "PR-1234567890-REV12", paid: "Invoice Paid - Alpha Beta Gamma - Alpha Beta Gamma - PR-1234567890-REV12", full: (p) => `${p} - ${long} - ${long}` },
  ];
  for (const c of cases) {
    const p = buildInvoicePaidEmail(paid({ client: c.client, projectTitle: c.title, prNo: c.prNo }));
    assert.equal(p.subject, c.paid, `paid / ${c.name}`);
    assert.equal(headingOf(p.html), p.subject, `paid heading / ${c.name}`);
    const a = buildPRRequestApprovedEmail(approved({ client: c.client, projectTitle: c.title, prNo: c.prNo }));
    assert.equal(a.subject, c.full(APPROVED_PREFIX), `approved / ${c.name}`);
    assert.equal(headingOf(a.html), a.subject, `approved heading / ${c.name}`);
    const r = buildPRRequestRejectedEmail(rejected({ client: c.client, projectTitle: c.title, prNo: c.prNo }));
    assert.equal(r.subject, c.full(REJECTED_PREFIX), `rejected / ${c.name}`);
    assert.equal(headingOf(r.html), r.subject, `rejected heading / ${c.name}`);
    for (const e of [p, a, r]) {
      assert.ok(isOneCleanLine(e.subject) && !/undefined|null/.test(e.subject) && !/ - $/.test(e.subject) && !/ - - /.test(e.subject), `${c.name}: ${e.subject}`);
    }
  }
});

test("subjects are plain text ('&' stays '&', no entities or no-break spaces); the markup is escaped", () => {
  const p = buildInvoicePaidEmail(paid());
  assert.ok(p.subject.includes("F&G") && !/&amp;|&nbsp;|&lt;|&#39;/.test(p.subject) && !p.subject.includes(String.fromCharCode(160)));
  assert.ok(headingMarkup(p.html).includes("F&amp;G"));
  const a = buildPRRequestApprovedEmail(approved());
  assert.ok(a.subject.includes("3D F&G Mapping Services Project") && !/&amp;|&nbsp;/.test(a.subject));
  assert.ok(headingMarkup(a.html).includes("F&amp;G"));
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// HTML escaping
// ------------------------------------------------------------------------------------------------------------------------------------------

test("markup in every user-entered value — including the rejection reason — is escaped exactly once, in the body, the heading and the preview text", () => {
  const emails = [
    buildInvoicePaidEmail(paid({ requesterName: EVIL, prNo: EVIL, projectTitle: EVIL, client: EVIL, invoiceNo: EVIL })),
    buildPRRequestApprovedEmail(approved({ requesterName: EVIL, prNo: EVIL, projectTitle: EVIL, client: EVIL })),
    buildPRRequestRejectedEmail(rejected({ requesterName: EVIL, rejectedByName: EVIL, prNo: EVIL, projectTitle: EVIL, client: EVIL, reason: EVIL })),
  ];
  for (const e of emails) {
    assert.ok(!e.html.includes(EVIL), "no raw markup anywhere in the email");
    assert.ok(e.html.includes("&lt;b&gt;ZZ&lt;/b&gt;"), "it is shown as text");
    assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(e.html), "never double-encoded");
    assert.equal((e.html.match(/<h2\b/g) ?? []).length, 1, "still exactly one heading");
    assert.ok(e.subject.includes(EVIL) || e.subject.includes("ZZ"), "the subject is plain text: the value is not HTML-escaped there");
    assert.ok(!e.subject.includes("&lt;"));
  }
  const r = emails[2]!;
  assert.ok(r.html.includes(">&lt;b&gt;ZZ&lt;/b&gt;</td>"), "the rejection reason cell is escaped");
});

test("the rejection reason is shown exactly as typed (ampersands, quotes, angle brackets) and the other fields escape the same way", () => {
  const reason = `Budget & scope "Q4" > limit, owner's call <pending>`;
  const r = buildPRRequestRejectedEmail(rejected({ reason, rejectedByName: `O'Brien & Co`, requesterName: `Ravi <K>` }));
  assert.ok(r.html.includes(">Budget &amp; scope &quot;Q4&quot; &gt; limit, owner&#39;s call &lt;pending&gt;</td>"));
  assert.ok(r.html.includes("rejected by O&#39;Brien &amp; Co."));
  assert.ok(r.html.includes("Hello Ravi &lt;K&gt;,"));
  assert.ok(r.html.includes("please contact O&#39;Brien &amp; Co directly."));
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// subject CR/LF and control-character injection
// ------------------------------------------------------------------------------------------------------------------------------------------

test("CR/LF and control characters in the client, title or PR number never reach the subject: it is always one line", () => {
  const evilClient = "Acme" + CR + LF + "Bcc: attacker@example.invalid" + NUL + " Co" + NEL + "Ltd" + LS + "x";
  const evilTitle = "Plant" + CR + LF + "A" + LF + "Subject: spoof";
  const evilPr = "PR-1" + CR + LF + "X-Header: y";
  const p = buildInvoicePaidEmail(paid({ client: evilClient, projectTitle: evilTitle, prNo: evilPr }));
  assert.equal(p.subject, "Invoice Paid - Acme Bcc: attacker@example.invalid - Plant A Subject: - PR-1 X-Header: y");
  const a = buildPRRequestApprovedEmail(approved({ client: evilClient, projectTitle: evilTitle }));
  assert.equal(a.subject, `${APPROVED_PREFIX} - Acme Bcc: attacker@example.invalid Co Ltd x - Plant A Subject: spoof`);
  const r = buildPRRequestRejectedEmail(rejected({ client: evilClient, projectTitle: evilTitle }));
  assert.equal(r.subject, `${REJECTED_PREFIX} - Acme Bcc: attacker@example.invalid Co Ltd x - Plant A Subject: spoof`);
  for (const e of [p, a, r]) {
    assert.ok(isOneCleanLine(e.subject), JSON.stringify(e.subject));
    assert.equal(headingOf(e.html), e.subject, "and the heading shows the same single line");
  }
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// wrapping markup (same mechanism as the invoice emails)
// ------------------------------------------------------------------------------------------------------------------------------------------

test("wrapping: the heading breaks only after a ' -', never inside a name or the PR number", () => {
  assert.equal(headingMarkup(buildInvoicePaidEmail(paid({ prNo: "PR-12073-REV2" })).html),
    [kept("Invoice&nbsp;Paid&nbsp;-"), kept("HTH&nbsp;Technology&nbsp;Co&nbsp;-"), kept("3D&nbsp;F&amp;G&nbsp;Mapping&nbsp;-"), kept("PR-12073-REV2")].join(" "));
  // the long approved / rejected prefix may wrap; the client and title (each 36 characters or fewer here) are kept whole
  assert.equal(headingMarkup(buildPRRequestApprovedEmail(approved()).html),
    [`${APPROVED_PREFIX}&nbsp;-`, kept("HTH&nbsp;Technology&nbsp;Co&nbsp;Private&nbsp;Limited&nbsp;-"), kept("3D&nbsp;F&amp;G&nbsp;Mapping&nbsp;Services&nbsp;Project")].join(" "));
  assert.equal(renderPRRequestApprovedHeading({ client: "A", projectTitle: "B" }).startsWith('<h2 style="margin:0 0 20px; font-size:16px;'), true);
});

// ------------------------------------------------------------------------------------------------------------------------------------------
// everything else is unchanged
// ------------------------------------------------------------------------------------------------------------------------------------------

test("the templates carry no recipient information: each returns only a subject and html (To / CC / BCC stay the callers' business)", () => {
  for (const e of [buildInvoicePaidEmail(paid()), buildPRRequestApprovedEmail(approved()), buildPRRequestRejectedEmail(rejected())]) {
    assert.deepEqual(Object.keys(e).sort(), ["html", "subject"]);
  }
});

test("other email subjects are unchanged: Submitted, Accounts-approved (awaiting PMO), Shared, and every account email", () => {
  assert.deepEqual(Object.keys(EMAIL_SUBJECTS).sort(), [
    "ACCOUNT_CREATED", "ADMIN_PASSWORD_RESET", "FORGOT_PASSWORD", "INVOICE_SHARED", "PMO_COORDINATOR_ALLOCATED", "PR_REQUEST_ACCOUNTS_APPROVED", "PR_REQUEST_SUBMITTED", "RESET_SUCCESS", "WELCOME",
  ]);
  assert.equal(EMAIL_SUBJECTS.WELCOME, "Welcome to the iFluids Engineering PMO Portal");
  assert.equal(EMAIL_SUBJECTS.ACCOUNT_CREATED, "Your PMO Portal account has been created");
  assert.equal(EMAIL_SUBJECTS.FORGOT_PASSWORD, "Reset your PMO Portal password");
  assert.equal(EMAIL_SUBJECTS.RESET_SUCCESS, "Your PMO Portal password has been changed");
  assert.equal(EMAIL_SUBJECTS.ADMIN_PASSWORD_RESET, "Your PMO Portal password has been reset by an Administrator");
  assert.equal(EMAIL_SUBJECTS.PR_REQUEST_SUBMITTED, "New PR Request awaiting Accounts approval");
  assert.equal(EMAIL_SUBJECTS.PR_REQUEST_ACCOUNTS_APPROVED, "PR Request awaiting your approval");
  assert.equal(EMAIL_SUBJECTS.INVOICE_SHARED, "An invoice has been shared with you");
  assert.equal(EMAIL_SUBJECTS.PMO_COORDINATOR_ALLOCATED("PR-12073"), "PMO Project Assigned to You — PR-12073");

  const submitted = buildPRRequestSubmittedEmail({ accountsApproverName: "A", requesterName: "R", prNo: "PR-12073", projectTitle: TITLE, client: CLIENT, reviewUrl: URL_ });
  assert.equal(submitted.subject, "New PR Request awaiting Accounts approval");
  assert.ok(!/<h2\b/.test(submitted.html), "no heading was added to the Submitted email");
  const accountsApproved = buildPRRequestAccountsApprovedEmail({ pmoManagerName: "P", requesterName: "R", prNo: "PR-12073", projectTitle: TITLE, reviewUrl: URL_ });
  assert.equal(accountsApproved.subject, "PR Request awaiting your approval");
  assert.ok(!/<h2\b/.test(accountsApproved.html), "no heading was added to the Accounts-approved email");
  const shared = buildInvoiceSharedEmail({ recipientName: "R", sharedByName: "S", prNo: "PR-12073", projectTitle: TITLE, client: CLIENT, invoiceNo: "INV-1", invoiceAmountINR: 1, invoiceDateIso: "2026-10-01T00:00:00.000Z", invoicesUrl: URL_ });
  assert.equal(shared.subject, "An invoice has been shared with you");
  assert.ok(!/<h2\b/.test(shared.html), "no heading was added to the Shared email");
});

test("buildPRRequest*Subject accept missing values without throwing", () => {
  assert.equal(buildPRRequestApprovedSubject({}), APPROVED_PREFIX);
  assert.equal(buildPRRequestRejectedSubject({ client: null, projectTitle: undefined }), REJECTED_PREFIX);
  assert.equal(buildPRRequestRejectedSubject({ client: 42 as never, projectTitle: {} as never }), REJECTED_PREFIX);
});
