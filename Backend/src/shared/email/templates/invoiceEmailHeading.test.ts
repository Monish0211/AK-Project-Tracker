import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceRaisedSuccessfullyEmailData, InvoiceRequestAssignedEmailData } from "../email.types.js";
import {
  buildInvoiceEmailHeading,
  buildInvoiceRaisedSubject,
  buildInvoiceRequestSubject,
  firstWords,
  HEADING_MAX_WORDS,
  INVOICE_RAISED_HEADING_PREFIX,
  INVOICE_REQUEST_HEADING_PREFIX,
  renderInvoiceEmailHeading,
} from "./invoiceEmailHeading.js";
import { buildInvoiceRaisedSuccessfullyEmail } from "./invoiceRaisedSuccessfully.template.js";
import { buildInvoiceRequestAssignedEmail } from "./invoiceRequestAssigned.template.js";

/**
 * Subject AND heading of the Invoice Request and Invoice Raised emails (Oct 2026), one and the same text:
 *   "Invoice request - {first 3 words of client} - {first 3 words of project title} - {full PR number}"
 *   "Invoice has been raised - {first 3 words of client} - {first 3 words of project title} - {full PR number}"
 * Pure tests: no database, no network, no mail. Only the subject and the heading are new — greeting, message, button and details table must be exactly as before.
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

/** The heading element, as a client displays it (tags dropped, entities decoded; a non-breaking space looks like a space). Fails if there is not exactly one. */
const decode = (s: string): string => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
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

test("only the subject and the heading changed: greeting, message, button, preview and the details tables (with the FULL client / title / PR number) are as before", () => {
  const longClient = "Hindustan Petroleum Corporation Limited India";
  const longTitle = "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion";
  const raised = buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: longClient, projectTitle: longTitle }));
  assert.equal(raised.subject, "Invoice has been raised - Hindustan Petroleum Corporation - Quantitative Risk Assessment - PR-12073");
  assert.match(raised.html, /Hello Asha Rao,/);
  assert.match(raised.html, /Your requested invoice has been successfully raised\./);
  assert.match(raised.html, /Open Project Invoices/);
  assert.ok(raised.html.includes(`>${longClient}</td>`) && raised.html.includes(`>${longTitle}</td>`) && raised.html.includes(">PR-12073</td>"), "the table still shows the full values");
  assert.ok(raised.html.includes(`Your requested invoice for ${longTitle} has been raised.`), "preview text unchanged (full title)");

  const request = buildInvoiceRequestAssignedEmail(requestData({ client: longClient, projectTitle: longTitle }));
  assert.equal(request.subject, "Invoice request - Hindustan Petroleum Corporation - Quantitative Risk Assessment - PR-12073");
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
  assert.ok(html.includes(`<span style="white-space:nowrap;">Invoice&nbsp;has&nbsp;been&nbsp;raised&nbsp;-</span> <span style="white-space:nowrap;">Tata&nbsp;&amp;&nbsp;Sons&nbsp;-</span> <span style="white-space:nowrap;">O&#39;Brien&#39;s&nbsp;&lt;unit&gt;&nbsp;A&nbsp;-</span> <span style="white-space:nowrap;">PR-12073</span>`), "encoded once");
  assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(html), "never double-encoded");
  assert.equal(headingOf(html), "Invoice has been raised - Tata & Sons - O'Brien's <unit> A - PR-12073", "and it displays exactly as typed");
});

test("renderInvoiceEmailHeading is one styled <h2> and nothing else", () => {
  const markup = renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "A", projectTitle: "B", prNo: "C" });
  assert.equal(markup, `<h2 style="margin:0 0 20px; font-size:16px; line-height:1.4; font-weight:700; color:#0F172A; overflow-wrap:anywhere;"><span style="white-space:nowrap;">Invoice&nbsp;request&nbsp;-</span> <span style="white-space:nowrap;">A&nbsp;-</span> <span style="white-space:nowrap;">B&nbsp;-</span> <span style="white-space:nowrap;">C</span></h2>`);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// SUBJECT (Oct 2026): the email subject is the same text as the heading
// ---------------------------------------------------------------------------------------------------------------------------------------------

test("subjects: the two examples from the requirement, exactly — through the real templates", () => {
  assert.equal(buildInvoiceRequestAssignedEmail(requestData()).subject, "Invoice request - TEST CLIENT - Test Project Title - PR-12073");
  assert.equal(buildInvoiceRaisedSuccessfullyEmail(raisedData()).subject, "Invoice has been raised - HTH Technology Co - 3D F&G Mapping - PR-12073");
  assert.equal(buildInvoiceRequestSubject({ client: "TEST CLIENT", projectTitle: "Test Project Title", prNo: "PR-12073" }), "Invoice request - TEST CLIENT - Test Project Title - PR-12073");
  assert.equal(buildInvoiceRaisedSubject({ client: "HTH Technology Co", projectTitle: "3D F&G Mapping", prNo: "PR-12073" }), "Invoice has been raised - HTH Technology Co - 3D F&G Mapping - PR-12073");
});

test("subjects: the old fixed subjects are gone", () => {
  for (const subject of [buildInvoiceRequestAssignedEmail(requestData()).subject, buildInvoiceRaisedSuccessfullyEmail(raisedData()).subject]) {
    assert.ok(!/please raise this invoice|Your requested invoice has been raised/.test(subject), subject);
  }
});

test("subject and body heading are always the SAME text — short, long, hyphenated, punctuated, spaced and missing values", () => {
  const cases: Partial<InvoiceRequestAssignedEmailData>[] = [
    {},
    { client: "Hindustan Petroleum Corporation Limited India", projectTitle: "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion" },
    { client: "A", projectTitle: "B", prNo: "C" },
    { client: "Al-Rashid Oil-Gas Co Ltd", projectTitle: "Pre-FEED Study of Sour-Gas Lines", prNo: "PR-12073-REV2" },
    { client: `Tata & Sons "Ltd" India`, projectTitle: `O'Brien's <unit> A`, prNo: "PR-1" },
    { client: "  TEST    CLIENT\nONE TWO ", projectTitle: "\n Test   Project\tTitle X ", prNo: " PR-12073\n" },
    { client: "", projectTitle: "Only Title Here", prNo: "PR-9" },
    { client: "Only Client Here", projectTitle: "", prNo: "" },
    { client: "", projectTitle: "", prNo: "" },
    { client: "x".repeat(80), projectTitle: "y".repeat(80) + " z", prNo: "PR-7" },
  ];
  for (const c of cases) {
    const request = buildInvoiceRequestAssignedEmail(requestData(c));
    assert.equal(headingOf(request.html), request.subject, `request ${JSON.stringify(c)}`);
    const raised = buildInvoiceRaisedSuccessfullyEmail(raisedData({ client: c.client ?? "HTH Technology Co", projectTitle: c.projectTitle ?? "3D F&G Mapping", prNo: c.prNo ?? "PR-12073" }));
    assert.equal(headingOf(raised.html), raised.subject, `raised ${JSON.stringify(c)}`);
  }
});

test("subjects: first 3 words of client and title, full PR number, hyphenated terms as one word, whitespace normalised", () => {
  assert.equal(buildInvoiceRequestSubject({ client: "Hindustan Petroleum Corporation Limited India", projectTitle: "Re-HAZOP and LOPA Study for LIWA Plastics (EPC-1)", prNo: "PR-12073-A Rev 2 final copy" }),
    "Invoice request - Hindustan Petroleum Corporation - Re-HAZOP and LOPA - PR-12073-A Rev 2 final copy");
  assert.equal(buildInvoiceRaisedSubject({ client: "Al-Rashid Oil-Gas Co Ltd", projectTitle: "Pre-FEED Study of Lines", prNo: "PR-5" }), "Invoice has been raised - Al-Rashid Oil-Gas Co - Pre-FEED Study of - PR-5");
  assert.equal(buildInvoiceRaisedSubject({ client: "  Acme   Ltd \n", projectTitle: "\tPhase  2 \r\n Study  extra", prNo: "  PR-1  " }), "Invoice has been raised - Acme Ltd - Phase 2 Study - PR-1");
});

test("subjects: missing values give no dangling hyphen, 'undefined' or 'null'", () => {
  assert.equal(buildInvoiceRequestSubject({ client: null, projectTitle: "Test Project Title", prNo: "PR-1" }), "Invoice request - Test Project Title - PR-1");
  assert.equal(buildInvoiceRequestSubject({ client: "TEST CLIENT", projectTitle: undefined, prNo: "" }), "Invoice request - TEST CLIENT");
  assert.equal(buildInvoiceRaisedSubject({}), "Invoice has been raised");
  assert.equal(buildInvoiceRaisedSubject({ client: "   ", projectTitle: "\n", prNo: " " }), "Invoice has been raised");
  for (const s of [buildInvoiceRequestSubject({ client: null }), buildInvoiceRaisedSubject({ projectTitle: undefined, prNo: null })]) assert.ok(!/undefined|null| - $|- -/.test(s), s);
});

test("subjects are PLAIN TEXT: '&', quotes and angle brackets stay as typed (only the HTML heading is escaped), and there is no non-breaking space", () => {
  const values = { client: `Tata & Sons "Ltd" India`, projectTitle: `O'Brien's <unit> A`, prNo: "PR-1" };
  const subject = buildInvoiceRaisedSubject(values);
  assert.equal(subject, `Invoice has been raised - Tata & Sons - O'Brien's <unit> A - PR-1`);
  assert.ok(!/&amp;|&lt;|&#39;|&nbsp;|\u00A0/.test(subject), "no entities / no-break spaces in a subject");
  assert.equal(buildInvoiceRaisedSuccessfullyEmail(raisedData(values)).subject, subject, "the template uses exactly this");
});

test("subjects are one line: line breaks, tabs and control characters (header-injection attempts) collapse to a single space", () => {
  const evil = "Acme\r\nBcc: attacker@example.com\u0000 Co\u0085Ltd\u2028x";
  const subject = buildInvoiceRequestSubject({ client: evil, projectTitle: "T\r\n\tU", prNo: "PR-1\r\nX-Header: y" });
  assert.ok(!/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(subject), JSON.stringify(subject));
  assert.equal(subject, "Invoice request - Acme Bcc: attacker@example.com - T U - PR-1 X-Header: y");
  assert.equal(subject.split("\n").length, 1);
});

test("subjects follow the data: different projects give different subjects, never a fixed text", () => {
  const a = buildInvoiceRequestAssignedEmail(requestData({ client: "Acme Industries", projectTitle: "Pipeline Integrity Review", prNo: "PR-100" })).subject;
  const b = buildInvoiceRequestAssignedEmail(requestData({ client: "Zenith Gas Works Pvt Ltd", projectTitle: "Flare Study Phase Two", prNo: "PR-200" })).subject;
  assert.deepEqual([a, b], ["Invoice request - Acme Industries - Pipeline Integrity Review - PR-100", "Invoice request - Zenith Gas Works - Flare Study Phase - PR-200"]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// WRAPPING (Oct 2026): a heading longer than one line breaks only between its " - " parts, never inside a name, never with a line starting "-"
// ---------------------------------------------------------------------------------------------------------------------------------------------

const inner = (markup: string): string => markup.replace(/^<h2[^>]*>/, "").replace(/<\/h2>$/, "");

/** One kept-together part of the heading, as the markup builds it. */
const kept = (text: string): string => `<span style="white-space:nowrap;">${text}</span>`;

test("wrapping: the user's two headings are bound so the only break opportunities are after each ' -'", () => {
  const raised = renderInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, { client: "HTH Technology Co", projectTitle: "3D F&G Mapping", prNo: "PR-12073" });
  const request = renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "TEST CLIENT", projectTitle: "Test Project Title", prNo: "PR-12073" });
  assert.equal(inner(raised), [kept("Invoice&nbsp;has&nbsp;been&nbsp;raised&nbsp;-"), kept("HTH&nbsp;Technology&nbsp;Co&nbsp;-"), kept("3D&nbsp;F&amp;G&nbsp;Mapping&nbsp;-"), kept("PR-12073")].join(" "));
  assert.equal(inner(request), [kept("Invoice&nbsp;request&nbsp;-"), kept("TEST&nbsp;CLIENT&nbsp;-"), kept("Test&nbsp;Project&nbsp;Title&nbsp;-"), kept("PR-12073")].join(" "));
  for (const markup of [raised, request]) {
    const text = inner(markup).split('<span style="white-space:nowrap;">').join("«").split("</span>").join("»");
    // every ordinary (breakable) space sits directly after a part's separator hyphen: no break can fall inside a name, before a hyphen, or inside the PR number
    for (const m of text.matchAll(/ /g)) assert.equal(text.slice(m.index! - 8, m.index!), "&nbsp;-»", "breakable space only between kept-together parts");
    assert.ok(!/ - /.test(text), "no ' - ' with breakable spaces on both sides");
  }
});

test("wrapping: names up to 36 characters are kept whole (a 31-character client name is not split); a hyphenated PR number is never broken at its hyphens", () => {
  const markup = inner(renderInvoiceEmailHeading(INVOICE_RAISED_HEADING_PREFIX, { client: "Hindustan Petroleum Corporation Limited India", projectTitle: "Quantitative Risk Assessment (QRA)", prNo: "PR-12073-REV2" }));
  assert.ok(markup.includes(kept("Hindustan&nbsp;Petroleum&nbsp;Corporation&nbsp;-")), markup);
  assert.ok(markup.includes(kept("Quantitative&nbsp;Risk&nbsp;Assessment&nbsp;-")), markup);
  assert.ok(markup.endsWith(kept("PR-12073-REV2")), "PR number in one nowrap part");
});

test("wrapping: a part longer than 36 characters keeps ordinary spaces so it can still wrap (it must never be clipped by the email card)", () => {
  const longClient = "Alphaxxxxxxxx Betaxxxxxxxx Gammaxxxxxxxx Delta"; // first 3 words = 40 characters -> over the limit, not kept together
  const markup = inner(renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: longClient, projectTitle: "Very Long Corporate Name Holdings", prNo: "PR-" + "1".repeat(45) }));
  assert.ok(markup.includes("Alphaxxxxxxxx Betaxxxxxxxx Gammaxxxxxxxx&nbsp;-"), "long client part keeps ordinary spaces: " + markup);
  assert.ok(!markup.includes(kept("Alphaxxxxxxxx")), "and has no nowrap span");
  assert.ok(markup.includes(kept("Very&nbsp;Long&nbsp;Corporate&nbsp;-")), "a short 3-word part is kept together");
  assert.ok(!markup.includes('nowrap;">PR-'), "an over-long PR number is not forced onto one line either");
  assert.equal(decode(markup), "Invoice request - Alphaxxxxxxxx Betaxxxxxxxx Gammaxxxxxxxx - Very Long Corporate - PR-" + "1".repeat(45));
});

test("wrapping: the heading is 16px and allows breaking an over-long single word", () => {
  const markup = renderInvoiceEmailHeading(INVOICE_REQUEST_HEADING_PREFIX, { client: "A", projectTitle: "B", prNo: "C" });
  assert.ok(/font-size:16px/.test(markup) && /font-weight:700/.test(markup) && /color:#0F172A/.test(markup) && /margin:0 0 20px/.test(markup) && /overflow-wrap:anywhere/.test(markup));
});
