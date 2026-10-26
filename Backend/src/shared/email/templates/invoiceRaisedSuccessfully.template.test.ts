import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL_SUBJECTS } from "../email.constants.js";
import type { InvoiceRaisedSuccessfullyEmailData } from "../email.types.js";
import { buildInvoiceRaisedSuccessfullyEmail } from "./invoiceRaisedSuccessfully.template.js";

/**
 * Invoice Raised email (Request Invoice workflow) — pure template tests, no database, no network, no mail. Covers the Client Name row
 * added in Oct 2026 and proves everything that was already in the email is still there, unchanged.
 */

const base: InvoiceRaisedSuccessfullyEmailData = {
  requesterName: "Asha Rao",
  prNo: "PR-11058",
  client: "Hindustan Petroleum Corporation Limited",
  projectTitle: "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion",
  invoicesUrl: "https://pmodashboard.ifluids.in/projects/view/p-1?tab=invoices",
};

const html = (over: Partial<InvoiceRaisedSuccessfullyEmailData> = {}) => buildInvoiceRaisedSuccessfullyEmail({ ...base, ...over }).html;

/** The details table only (the layout wrapper has its own tables/cells). */
function detailsTable(markup: string): string {
  const start = markup.indexOf('margin:16px 0; border:1px solid #E2E8F0');
  assert.ok(start >= 0, "details table present");
  return markup.slice(start, markup.indexOf("</table>", start));
}

/** The text of every <td> in the details table, in order. */
function cells(markup: string): string[] {
  return [...detailsTable(markup).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]!.trim());
}

const rowCount = (markup: string): number => (detailsTable(markup).match(/<tr>/g) ?? []).length;

test("shows PR Number, Client Name and Project Title — in that order, label then value", () => {
  assert.deepEqual(cells(html()), [
    "PR Number", "PR-11058",
    "Client Name", "Hindustan Petroleum Corporation Limited",
    "Project Title", "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion",
  ]);
});

test("everything that was already in the email is unchanged: subject, greeting, message, button, preview, PR and Title rows", () => {
  const email = buildInvoiceRaisedSuccessfullyEmail(base);
  assert.equal(email.subject, EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
  assert.equal(email.subject, "Your requested invoice has been raised");
  assert.match(email.html, /Hello Asha Rao,/);
  assert.match(email.html, /Your requested invoice has been successfully raised\./);
  assert.match(email.html, /Your requested invoice for Quantitative Risk Assessment \(QRA\) for the Visakh refinery expansion has been raised\./, "preview text");
  assert.match(email.html, /Open Project Invoices/);
  assert.ok(email.html.includes('href="https://pmodashboard.ifluids.in/projects/view/p-1?tab=invoices"'), "button still points at the project's invoices");
  // The two original rows are byte-for-byte what they were before the Client Name row was added.
  assert.ok(email.html.includes('<td style="padding:12px 16px; font-size:13px; color:#64748B;">PR Number</td>'));
  assert.ok(email.html.includes('<td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600;">PR-11058</td>'));
  assert.ok(email.html.includes('<td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Project Title</td>'));
  assert.ok(
    email.html.includes(
      '<td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">Quantitative Risk Assessment (QRA) for the Visakh refinery expansion</td>'
    )
  );
});

test("the Client Name row uses the same styling as the Project Title row (label grey, value bold, divider above)", () => {
  const out = html();
  assert.ok(out.includes('<td style="padding:12px 16px; font-size:13px; color:#64748B; border-top:1px solid #E2E8F0;">Client Name</td>'));
  assert.ok(
    out.includes('<td style="padding:12px 16px; font-size:13px; color:#0F172A; font-weight:600; border-top:1px solid #E2E8F0;">Hindustan Petroleum Corporation Limited</td>')
  );
  assert.equal(rowCount(out), 3);
  assert.equal((detailsTable(out).match(/<\/tr>/g) ?? []).length, 3);
});

test("the client name is HTML-escaped: markup in it shows as text and can never inject HTML", () => {
  const out = html({ client: `Tata & Sons <script>alert("x")</script> 'Pvt'` });
  assert.ok(!out.includes("<script>"), "no raw script tag");
  assert.ok(out.includes("Tata &amp; Sons &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;Pvt&#39;"));
  assert.equal(rowCount(out), 3, "the table structure is not broken by the value");
});

test("surrounding whitespace in the client name is trimmed", () => {
  assert.deepEqual(cells(html({ client: "  Acme Ltd \n" })).slice(2, 4), ["Client Name", "Acme Ltd"]);
});

test("a missing, null or blank client leaves the row out cleanly — no empty cell, no 'undefined'/'null', the other rows and the button intact", () => {
  for (const client of [undefined, null, "", "   ", "\n\t"]) {
    const out = html({ client });
    assert.deepEqual(cells(out), [
      "PR Number", "PR-11058",
      "Project Title", "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion",
    ], JSON.stringify(client));
    assert.ok(!out.includes("Client Name"), JSON.stringify(client));
    assert.ok(!/undefined|>null</.test(out), JSON.stringify(client));
    assert.equal(rowCount(out), 2);
    assert.match(out, /Open Project Invoices/);
  }
  // `client` is optional in the data type, so a caller that does not pass it at all still compiles and renders.
  const { client: _omit, ...withoutClient } = base;
  assert.equal(buildInvoiceRaisedSuccessfullyEmail(withoutClient).subject, "Your requested invoice has been raised");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// HTML-escaping hardening (Oct 2026). PR Number, Project Title, requester name and the preview text are user-controlled (any project
// editor / PR Request author / admin can set them) and used to be inserted raw; renderEmailLayout() also drops previewText verbatim into a
// hidden <div>, so a "</div>" in a project title used to render injected markup at the top of the email. Everything is now escaped once.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Inverse of escapeHtml — what an email client DISPLAYS for an entity-encoded value ("&amp;" last so "&amp;lt;" stays "&lt;"). */
const decode = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const HOSTILE = `</div><a href="https://evil.example/login">Verify your invoice</a><img src="https://evil.example/p.gif" onerror="x()"><script>alert(1)</script>`;
const hostileEscaped = `&lt;/div&gt;&lt;a href=&quot;https://evil.example/login&quot;&gt;Verify your invoice&lt;/a&gt;&lt;img src=&quot;https://evil.example/p.gif&quot; onerror=&quot;x()&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;`;

/** The hidden preview block the layout emits (its inner HTML). */
function previewBlock(markup: string): string {
  const m = markup.match(/<div style="display:none; max-height:0; overflow:hidden; opacity:0;">([\s\S]*?)<\/div>/);
  assert.ok(m, "hidden preview block present");
  return m![1]!;
}

/** Counts of every structural/active tag, so an injected tag anywhere shows up as a difference from the benign email. */
function tagCounts(markup: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tag of ["<a ", "<img", "<script", "<div", "</div>", "<table", "<tr>", "<td", "<p ", "<b>", "<u>", "<style", "<iframe"]) {
    out[tag] = markup.split(tag).length - 1;
  }
  return out;
}

test("a hostile project title is shown as text everywhere — the Title cell AND the preview text — and no injected tag is emitted", () => {
  const out = html({ projectTitle: HOSTILE });
  assert.deepEqual(cells(out).slice(4, 6), ["Project Title", hostileEscaped]);
  assert.equal(previewBlock(out), `Your requested invoice for ${hostileEscaped} has been raised.`);
  for (const live of ['<a href="https://evil', "<img", "<script", "onerror=\"x()\">", "</div><a"]) assert.ok(!out.includes(live), `no active markup: ${live}`);
  assert.equal(decode(cells(out)[5]!), HOSTILE, "an email client displays exactly what was entered");
});

test("the preview text cannot escape the hidden preview block: '</div>' in the title does not close it", () => {
  const out = html({ projectTitle: HOSTILE });
  const preview = previewBlock(out);
  assert.ok(!preview.includes("<"), "no raw '<' inside the hidden block");
  assert.ok(preview.endsWith(" has been raised."), "the block runs to the end of the sentence, so it was not cut short");
  // Exactly the same number of <div> / </div> as a harmless email: nothing was opened or closed by the value.
  assert.deepEqual(tagCounts(out), tagCounts(html()));
});

test("a PR Number containing HTML is escaped", () => {
  const prNo = `<script>alert(1)</script><b>PR</b>-1 & "x"`;
  const out = html({ prNo });
  assert.equal(cells(out)[1], "&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;PR&lt;/b&gt;-1 &amp; &quot;x&quot;");
  assert.ok(!out.includes("<script") && !out.includes("<b>PR</b>"));
  assert.equal(decode(cells(out)[1]!), prNo);
});

test("a requester name containing HTML is escaped in the greeting", () => {
  const requesterName = `<b>Asha</b> & "Co" <img src=x>`;
  const out = html({ requesterName });
  assert.ok(out.includes("Hello &lt;b&gt;Asha&lt;/b&gt; &amp; &quot;Co&quot; &lt;img src=x&gt;,"));
  assert.ok(!out.includes("<b>Asha</b>") && !out.includes("<img src=x>"));
  assert.deepEqual(tagCounts(out), tagCounts(html()));
});

test("normal text with ampersands, quotes and angle brackets displays correctly and is encoded exactly once (no double-escaping)", () => {
  const projectTitle = `Oil & Gas "Phase 2" <rev A> — O'Brien's unit`;
  const client = `Tata & Sons "Ltd" <India>`;
  const prNo = `PR-2026 & 1`;
  const requesterName = `Rao & O'Neil`;
  const out = html({ projectTitle, client, prNo, requesterName });

  assert.deepEqual(cells(out).map((c, i) => (i % 2 === 1 ? decode(c) : c)), ["PR Number", prNo, "Client Name", client, "Project Title", projectTitle]);
  assert.ok(out.includes("Hello Rao &amp; O&#39;Neil,"));
  assert.equal(decode(previewBlock(out)), `Your requested invoice for ${projectTitle} has been raised.`);
  assert.ok(previewBlock(out).includes("Oil &amp; Gas &quot;Phase 2&quot; &lt;rev A&gt;"), "preview encoded once");
  assert.ok(!/&amp;(amp|lt|gt|quot|#39);/.test(out), "never double-encoded anywhere in the email");
});

test("plain titles and names still render byte-for-byte as before (nothing to encode)", () => {
  const out = html();
  assert.ok(out.includes("Hello Asha Rao,"));
  assert.equal(cells(out)[1], "PR-11058");
  assert.equal(cells(out)[5], "Quantitative Risk Assessment (QRA) for the Visakh refinery expansion");
  assert.equal(previewBlock(out), "Your requested invoice for Quantitative Risk Assessment (QRA) for the Visakh refinery expansion has been raised.");
});

test("with every user-controlled field hostile at once: order, styling, subject and the Open Project Invoices button are all intact", () => {
  const email = buildInvoiceRaisedSuccessfullyEmail({ ...base, requesterName: HOSTILE, prNo: HOSTILE, client: HOSTILE, projectTitle: HOSTILE });
  assert.deepEqual(cells(email.html), ["PR Number", hostileEscaped, "Client Name", hostileEscaped, "Project Title", hostileEscaped]);
  assert.deepEqual(tagCounts(email.html), tagCounts(html()), "an injected value adds no tag of any kind");
  assert.equal(email.subject, EMAIL_SUBJECTS.INVOICE_RAISED_SUCCESSFULLY);
  assert.ok(email.html.includes('href="https://pmodashboard.ifluids.in/projects/view/p-1?tab=invoices"'), "button link unchanged");
  assert.match(email.html, /Open Project Invoices/);
  assert.match(email.html, /Your requested invoice has been successfully raised\./);
});

test("the Client Name row still follows the rules with the hardening in place: omitted when blank, and the other rows are still escaped", () => {
  for (const client of [undefined, null, "", "  \n"]) {
    const out = html({ client, projectTitle: HOSTILE });
    assert.deepEqual(cells(out), ["PR Number", "PR-11058", "Project Title", hostileEscaped], JSON.stringify(client));
    assert.ok(!out.includes("Client Name"));
    assert.equal(rowCount(out), 2);
  }
});
