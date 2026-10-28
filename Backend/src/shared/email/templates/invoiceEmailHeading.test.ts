import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { InvoiceRaisedSuccessfullyEmailData, InvoiceRequestAssignedEmailData } from "../email.types.js";
import {
  buildInvoiceEmailHeading,
  firstWords,
  HEADING_MAX_WORDS,
  INVOICE_RAISED_HEADING_PREFIX,
  INVOICE_REQUEST_HEADING_PREFIX,
  renderInvoiceEmailHeading,
} from "./invoiceEmailHeading.js";
import { buildInvoiceRaisedSuccessfullyEmail } from "./invoiceRaisedSuccessfully.template.js";
import { buildInvoiceRequestAssignedEmail } from "./invoiceRequestAssigned.template.js";

/**
 * Heading of the Invoice Request and Invoice Raised emails (Oct 2026):
 *   "Invoice request - {first 3 words of client} - {first 3 words of project title} - {full PR number}"
 *   "Invoice has been raised - {first 3 words of client} - {first 3 words of project title} - {full PR number}"
 * Pure tests: no database, no network, no mail. Only the heading is new — subject, body, button and details table must be exactly as before.
 */

const raisedData = (over: Partial<InvoiceRaisedSuccessfullyEmailData> = {}): InvoiceRaisedSuccessfullyEmailData => ({
  requesterName: "Asha Rao",
  prNo: "PR-12073",
  client: "HTH Technology Co",
  projectTitle: "3D F&G Mapping",
  invoicesUrl: "https://pmodashboard.ifluids.in/projects/view/p-1?tab=invoices",
  ...over,
});

const requestData = (over: Partial<InvoiceRequestAssignedEmailData> = {}): InvoiceRequestAssignedEmailData => ({
  assignedToName: "Ravi Kumar",
  requesterName: "Asha Rao",
  prNo: "PR-12073",
  projectTitle: "Test Project Title",
  client: "TEST CLIENT",
  clientContactName: "Contact Person",
  clientContactPhone: "+91 90000 00000",
  clientContactEmail: "contact@example.invalid",
  invoiceAmountNote: "about 3 lakh",
  copiesRequired: "2",
  drawingsAvailable: "Yes",
  printingDetails: "A4, colour",
  address: "Chennai",
  notes: "Please raise today",
  invoicesUrl: "https://pmodashboard.ifluids.in/projects/view/p-1?tab=invoices",
  ...over,
});

/** The heading element, as a client displays it (entities decoded). Fails if there is not exactly one. */
const decode = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
function headingOf(html: string): string {
  const all = [...html.matchAll(/<h2 style="[^"]*">([\s\S]*?)<\/h2>/g)];
  assert.equal(all.length, 1, "exactly one heading in the email");
  return decode(all[0]![1]!);
}

test("the two examples from the requirement, exactly", () => {
  assert.equal(buildInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, { client: "HTH Technology Co", projectTitle: "3D F&G Mapping", prNo: "PR-12073" }),
    "Invoice has been raised - HTH Technology Co - 3D F&G Mapping - PR-12073");
  assert.equal(buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "TEST CLIENT", projectTitle: "Test Project Title", prNo: "PR-12073" }),
    "Invoice request - TEST CLIENT - Test Project Title - PR-12073");
  // ...and the same through the real templates
  assert.equal(headingOf(buildInvoiceRaisedSuccessfullyEmail(raisedData()).html), "Invoice has been raised - HTH Technology Co - 3D F&G Mapping - PR-12073");
  assert.equal(headingOf(buildInvoiceRequestAssignedEmail(requestData()).html), "Invoice request - TEST CLIENT - Test Project Title - PR-12073");
});

test("the prefixes are the requested wording, and the word limit is three", () => {
  assert.equal(INVOICE_REQUEST_HEADING_PREFIX, "Invoice request");
  assert.equal(INVOICE_RAISED_HEADING_PREFIX, "Invoice has been raised");
  assert.equal(HEADING_MAX_WORDS, 3);
});

test("client name: only the first 3 words; exactly 3, 2 or 1 words are shown whole", () => {
  assert.equal(firstWords("Hindustan Petroleum Corporation Limited India"), "Hindustan Petroleum Corporation");
  assert.equal(firstWords("Hindustan Petroleum Corporation"), "Hindustan Petroleum Corporation");
  assert.equal(firstWords("Hindustan Petroleum"), "Hindustan Petroleum");
  assert.equal(firstWords("Hindustan"), "Hindustan");
  for (const email of [
    buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: "Hindustan Petroleum Corporation Limited India" })).html,
    buildInvoiceRequestAssignedEmail(requestData({ client: "Hindustan Petroleum Corporation Limited India" })).html,
  ]) assert.match(headingOf(email), / - Hindustan Petroleum Corporation - /);
});

test("project title: only the first 3 words; a hyphenated word counts as one", () => {
  assert.equal(firstWords("Quantitative Risk Assessment (QRA) for the Visakh refinery expansion"), "Quantitative Risk Assessment");
  assert.equal(firstWords("Re-HAZOP and LOPA Study for LIWA Plastics (EPC-1)"), "Re-HAZOP and LOPA");
  assert.equal(headingOf(buildInvoiceRaisedSuccessfullyEmail(raisedData({ projectTitle: "Re-HAZOP and LOPA Study for LIWA Plastics (EPC-1)" })).html),
    "Invoice has been raised - HTH Technology Co - Re-HAZOP and LOPA - PR-12073");
  assert.equal(headingOf(buildInvoiceRequestAssignedEmail(requestData({ projectTitle: "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion" })).html),
    "Invoice request - TEST CLIENT - Quantitative Risk Assessment - PR-12073");
});

test("the PR number is complete, last, and unlabelled — never cut to three words", () => {
  const heading = buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "A B C D", projectTitle: "E F G H", prNo: "PR-12073-A Rev 2 final copy" });
  assert.equal(heading, "Invoice request - A B C - E F G - PR-12073-A Rev 2 final copy");
  assert.ok(heading.endsWith("PR-12073-A Rev 2 final copy"));
  assert.ok(!/PR (Number|No)/i.test(heading), "no label");
});

test("extra whitespace is handled: trimmed, runs collapsed, tabs / line breaks / no-break spaces count as a gap", () => {
  assert.equal(firstWords("   Hindustan    Petroleum \t Corporation \n Limited  "), "Hindustan Petroleum Corporation");
  assert.equal(firstWords("A B C D"), "A B C");
  assert.equal(buildInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, { client: "  Acme   Ltd \n", projectTitle: "\tPhase  2 \r\n Study  extra", prNo: "  PR-1  " }),
    "Invoice has been raised - Acme Ltd - Phase 2 Study - PR-1");
  const html = buildInvoiceRequestAssignedEmail(requestData({ client: "  TEST    CLIENT\nONE TWO ", projectTitle: "\n Test   Project\tTitle X ", prNo: " PR-12073\n" })).html;
  assert.equal(headingOf(html), "Invoice request - TEST CLIENT ONE - Test Project Title - PR-12073");
  assert.ok(!/<h2[^>]*>[^<]*[\r\n\t]/.test(html), "no stray line breaks or tabs inside the heading");
});

test("missing values never leave a dangling separator or print 'undefined' / 'null'", () => {
  for (const blank of [undefined, null, "", "   ", "\n\t", " "]) {
    const label = JSON.stringify(blank);
    assert.equal(buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: blank, projectTitle: "Test Project Title", prNo: "PR-1" }), "Invoice request - Test Project Title - PR-1", `client ${label}`);
    assert.equal(buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "TEST CLIENT", projectTitle: blank, prNo: "PR-1" }), "Invoice request - TEST CLIENT - PR-1", `title ${label}`);
    assert.equal(buildInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "TEST CLIENT", projectTitle: "Test Project Title", prNo: blank }), "Invoice request - TEST CLIENT - Test Project Title", `pr ${label}`);
  }
  assert.equal(buildInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, {}), "Invoice has been raised");
  assert.equal(buildInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, { client: null, projectTitle: null, prNo: null }), "Invoice has been raised");
  // through the real templates; the Raised email's data type already allows a missing client
  const { client: _omit, ...withoutClient } = raisedData();
  const h = headingOf(buildInvoiceRaisedSuccessfullyEmail(withoutClient).html);
  assert.equal(h, "Invoice has been raised - 3D F&G Mapping - PR-12073");
  for (const email of [buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: null, projectTitle: "", prNo: "" })).html, buildInvoiceRequestAssignedEmail(requestData({ client: "", projectTitle: "", prNo: "" })).html]) {
    assert.ok(!/ - (?= - |<)/.test(headingOf(email)) && !/ - $/.test(headingOf(email)), "no doubled or trailing separator");
    assert.ok(!/undefined|null/.test(email.slice(email.indexOf("<h2"), email.indexOf("</h2>"))), "no 'undefined' / 'null' in the heading");
  }
});

test("values come from the actual data, not from fixed text: different data gives a different heading, every time", () => {
  const sets = [
    { client: "Acme Industries", projectTitle: "Pipeline Integrity Review", prNo: "PR-100" },
    { client: "Zenith Gas Works Pvt Ltd", projectTitle: "Flare Study Phase Two", prNo: "PR-200" },
  ];
  const headings = sets.map((s) => headingOf(buildInvoiceRequestAssignedEmail(requestData(s)).html));
  assert.deepEqual(headings, ["Invoice request - Acme Industries - Pipeline Integrity Review - PR-100", "Invoice request - Zenith Gas Works - Flare Study Phase - PR-200"]);
  const raised = sets.map((s) => headingOf(buildInvoiceRaisedSuccessfullyEmail(raisedData(s)).html));
  assert.deepEqual(raised, ["Invoice has been raised - Acme Industries - Pipeline Integrity Review - PR-100", "Invoice has been raised - Zenith Gas Works - Flare Study Phase - PR-200"]);
});

test("the heading is the first thing in the email body, above the greeting, in both emails", () => {
  for (const html of [buildInvoiceRaisedSuccessfullyEmail(raisedData()).html, buildInvoiceRequestAssignedEmail(requestData()).html]) {
    const h = html.indexOf("<h2");
    const hello = html.indexOf("Hello ");
    assert.ok(h > 0 && hello > h, "heading precedes the greeting");
    assert.ok(html.indexOf("&copy;") > hello, "and the footer comes after");
  }
});

test("the heading is present however the Invoice Request email is built: no files, files attached, files not attached", () => {
  const files = [{ fileName: "po.pdf", sizeLabel: "120 KB" }];
  for (const attachments of [undefined, { mode: "attached" as const, files }, { mode: "not_attached" as const, files, notAttachedReason: "Too large." }]) {
    const html = buildInvoiceRequestAssignedEmail(requestData({ ...(attachments ? { attachments } : {}) })).html;
    assert.equal(headingOf(html), "Invoice request - TEST CLIENT - Test Project Title - PR-12073");
  }
});

test("only the heading changed: subjects, greeting, message, button, preview and the details tables (with the FULL client / title / PR number) are as before", () => {
  const longClient = "Hindustan Petroleum Corporation Limited India";
  const longTitle = "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion";
  const raised = buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: longClient, projectTitle: longTitle }));
  assert.equal(raised.subject, EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
  assert.equal(raised.subject, "Your requested invoice has been raised");
  assert.match(raised.html, /Hello Asha Rao,/);
  assert.match(raised.html, /Your requested invoice has been successfully raised\./);
  assert.match(raised.html, /Open Project Invoices/);
  assert.ok(raised.html.includes(`>${longClient}</td>`) && raised.html.includes(`>${longTitle}</td>`) && raised.html.includes(">PR-12073</td>"), "the table still shows the full values");
  assert.ok(raised.html.includes(`Your requested invoice for ${longTitle} has been raised.`), "preview text unchanged (full title)");

  const request = buildInvoiceRequestAssignedEmail(requestData({ client: longClient, projectTitle: longTitle }));
  assert.equal(request.subject, EMAIL_SUBJECTS.INVOICE_REQUEST_ASSIGNED);
  assert.match(request.html, /Hello Ravi Kumar,/);
  assert.match(request.html, /Asha Rao has requested that you raise the invoice for the project below\./);
  assert.match(request.html, /Open Project Invoices/);
  assert.ok(request.html.includes(`>${longClient}</td>`) && request.html.includes(`>${longTitle}</td>`) && request.html.includes(">PR-12073</td>"), "the table still shows the full values");
  for (const label of ["Client Name", "Project Name", "Project No.", "Client Contact Name", "Phone Number", "E-mail Id", "Invoice Amount", "Number of Copies Required", "Reports/Drawings Available", "Report Printing Details", "Address", "Special Note"]) {
    assert.ok(request.html.includes(`>${label}</td>`), `row "${label}" still present`);
  }
  assert.ok(request.html.includes(`${"Asha Rao"} requested that you raise the invoice for ${longTitle}.`), "preview text unchanged (full title)");
});

test("values are HTML-escaped exactly once in the heading, and a hostile value adds no tag", () => {
  const hostile = `</div><a href="https://evil.example/x">Click</a><img src=x onerror=y()><script>alert(1)</script>`;
  for (const out of [
    buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: hostile, projectTitle: hostile, prNo: hostile })).html,
    buildInvoiceRequestAssignedEmail(requestData({ client: hostile, projectTitle: hostile, prNo: hostile })).html,
  ]) {
    const heading = out.slice(out.indexOf("<h2"), out.indexOf("</h2>") + 5);
    assert.ok(!/<(a|img|script|div)\b/i.test(heading.replace(/^<h2[^>]*>/, "").replace(/<\/h2>$/, "")), "no raw tag inside the heading text");
    assert.ok(!out.includes('<a href="https://evil') && !out.includes("<img src=x") && !out.includes("<script>alert(1)"), "nothing injected anywhere");
    assert.equal((out.match(/<h2\b/g) ?? []).length, 1, "still exactly one heading");
  }
  // normal text with an ampersand / quotes: encoded once, displayed correctly
  const html = buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: `Tata & Sons "Ltd" India`, projectTitle: `O'Brien's <unit> A` })).html;
  assert.ok(html.includes("Invoice has been raised - Tata &amp; Sons - O&#39;Brien&#39;s &lt;unit&gt; A - PR-12073"), "encoded once");
  assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(html), "never double-encoded");
});

test("renderInvoiceEmailHeading is one styled <h2> and nothing else", () => {
  const markup = renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "A", projectTitle: "B", prNo: "C" });
  assert.match(markup, /^<h2 style="[^"]+">Invoice request - A - B - C<\/h2>$/);
});
