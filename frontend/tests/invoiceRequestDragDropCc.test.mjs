// Request Invoice: drag-and-drop attachments, email-conversation files (.eml / .msg), and Additional CC Email Addresses (Oct 2026).
// No browser: the pure helpers run as-is, the views are rendered server-side in each state, and the drop zone's event handlers are
// exercised by reading them off the component's own output and calling them with fake events (the real-browser behaviour is checked
// separately by driving the page). The modal, whose Portal needs a real document, is checked structurally from its source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const MB = 1024 * 1024;
let vite;
let load;
let React;
let renderToStaticMarkup;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const fakeFile = (name, size = 1000, lastModified = 1) => ({ name, size, lastModified });
const ZONE = "/src/pages/Projects/components/Invoice/AttachmentDropZone.tsx";
const CC = "/src/pages/Projects/components/Invoice/CcEmailInput.tsx";
const noop = () => {};

const renderView = async (over = {}) => {
  const { AttachmentDropZoneView } = await load(ZONE);
  return renderToStaticMarkup(
    React.createElement(AttachmentDropZoneView, {
      files: [], errors: [], dragging: false, disabled: false, inputRef: { current: null },
      onBrowse: noop, onZoneKeyDown: noop, onDragEnter: noop, onDragOver: noop, onDragLeave: noop, onDrop: noop, onInputChange: noop, onRemove: noop,
      ...over,
    })
  );
};

/** The drop zone's handlers, read off what the component renders (it renders the view with them as props). */
const zoneHandlers = async (over = {}) => {
  const { AttachmentDropZone } = await load(ZONE);
  const added = [];
  const clicks = [];
  let captured;
  const Probe = () => {
    captured = AttachmentDropZone({ files: [], errors: [], disabled: false, onFilesAdded: (f) => added.push(f), onRemove: noop, ...over }).props;
    captured.inputRef.current = { click: () => clicks.push("click") }; // stands in for the hidden <input type="file">
    return null;
  };
  renderToStaticMarkup(React.createElement(Probe));
  return { props: captured, added, clicks };
};
const dragEvent = (types, files = []) => {
  const calls = { prevented: 0 };
  return { calls, dataTransfer: { types, files, dropEffect: "" }, preventDefault: () => calls.prevented++ };
};

// ---------------------------------------------------------------- email conversation files

test("email conversations: .eml and .msg are accepted, described as email conversations, and a PDF export stays an ordinary PDF", async () => {
  const m = await load("/src/utils/invoiceRequestAttachments.ts");
  const result = m.addAttachments([], [fakeFile("Thread.EML"), fakeFile("Outlook mail.msg"), fakeFile("Conversation export.pdf")]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.files.length, 3);
  assert.deepEqual(m.describeAttachment("Thread.EML"), { typeLabel: "EML", kind: "email", isEmailConversation: true });
  assert.deepEqual(m.describeAttachment("mail.msg"), { typeLabel: "MSG", kind: "email", isEmailConversation: true });
  assert.deepEqual(m.describeAttachment("Conversation export.pdf"), { typeLabel: "PDF", kind: "document", isEmailConversation: false });
  assert.deepEqual(m.describeAttachment("photo.JPG"), { typeLabel: "JPG", kind: "image", isEmailConversation: false });
  assert.deepEqual(m.describeAttachment("noextension"), { typeLabel: "FILE", kind: "document", isEmailConversation: false });
  assert.match(m.ATTACHMENT_ACCEPT, /\.eml,\.msg$/);
});

test("email conversations follow the same limits as every other file, and lookalike names are still refused", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  const big = addAttachments([], [fakeFile("huge.eml", 10 * MB + 1), fakeFile("empty.msg", 0), fakeFile("mail.eml.exe"), fakeFile("mail.emlx"), fakeFile("mail.mbox")]);
  assert.deepEqual(big.files, []);
  assert.equal(big.errors.length, 5);
  assert.match(big.errors[0], /"huge\.eml" is .* each file must be 10 MB or smaller/);
  assert.match(big.errors[1], /"empty\.msg" is empty/);
  for (const e of big.errors.slice(2)) assert.match(e, /is not an allowed file type/);
});

// ---------------------------------------------------------------- drag-and-drop helpers

test("dragCarriesFiles: only a drag that carries files lights up the zone — not text, a link or nothing", async () => {
  const { dragCarriesFiles } = await load("/src/utils/invoiceRequestAttachments.ts");
  assert.equal(dragCarriesFiles(["Files"]), true);
  assert.equal(dragCarriesFiles(["text/plain", "Files"]), true);
  assert.equal(dragCarriesFiles(["text/plain"]), false);
  assert.equal(dragCarriesFiles(["text/uri-list"]), false);
  assert.equal(dragCarriesFiles([]), false);
  assert.equal(dragCarriesFiles(null), false);
  assert.equal(dragCarriesFiles(undefined), false);
});

test("filesFromList: a FileList-like becomes a plain array; nothing becomes an empty one", async () => {
  const { filesFromList } = await load("/src/utils/invoiceRequestAttachments.ts");
  const a = fakeFile("a.pdf");
  const b = fakeFile("b.pdf");
  assert.deepEqual(filesFromList({ length: 2, 0: a, 1: b }), [a, b]);
  assert.deepEqual(filesFromList({ length: 0 }), []);
  assert.deepEqual(filesFromList(null), []);
  assert.deepEqual(filesFromList(undefined), []);
});

test("selection rules that apply to a drop apply equally to the picker: duplicates, count and total size", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  const first = addAttachments([], [fakeFile("a.pdf", 100, 5)]);
  const dup = addAttachments(first.files, [fakeFile("a.pdf", 100, 5), fakeFile("b.pdf", 100, 6)]);
  assert.deepEqual(dup.files.map((f) => f.name), ["a.pdf", "b.pdf"]);
  assert.equal(dup.errors.length, 1);
  assert.match(dup.errors[0], /"a\.pdf" is already added/);
  const six = addAttachments([], Array.from({ length: 6 }, (_, i) => fakeFile(`f${i}.pdf`, 100, i)));
  assert.equal(six.files.length, 5);
  assert.match(six.errors.join(" "), /at most 5 files/i);
  const totals = addAttachments([], [fakeFile("a.pdf", 9 * MB), fakeFile("b.pdf", 9 * MB), fakeFile("c.pdf", 9 * MB)]);
  assert.deepEqual(totals.files.map((f) => f.name), ["a.pdf", "b.pdf"]);
  assert.match(totals.errors.join(" "), /20 MB/);
});

// ---------------------------------------------------------------- the drop zone view

test("drop zone: idle state is a labelled, focusable button with the hint, the limits and the allowed types — and no file list", async () => {
  const html = await renderView();
  assert.match(html, /role="button"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /Drag and drop files here, or/);
  assert.match(html, /browse/);
  assert.match(html, /Up to 5 files, 10 MB each, 20 MB in total \(PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT, PNG, JPG, JPEG, EML, MSG\)/);
  assert.match(html, /Email conversations \(\.eml, \.msg or a PDF export\)/);
  assert.match(html, /data-dragging="false"/);
  assert.match(html, /type="file"[^>]*multiple/);
  assert.match(html, /accept="\.pdf,\.doc,\.docx,\.xls,\.xlsx,\.ppt,\.pptx,\.csv,\.txt,\.png,\.jpg,\.jpeg,\.eml,\.msg"/);
  assert.match(html, /data-testid="request-invoice-attachments"/);
  assert.ok(!/Selected attachments/.test(html) && !/data-attachment-errors/.test(html));
});

test("drop zone: the drag-over state is visibly different and says 'Drop to attach'", async () => {
  const idle = await renderView();
  const over = await renderView({ dragging: true });
  assert.match(over, /Drop to attach/);
  assert.match(over, /data-dragging="true"/);
  assert.match(over, /border-\[var\(--nu-accent\)\] bg-\[var\(--nu-accent-soft\)\]/);
  assert.ok(!/Drop to attach/.test(idle));
  assert.ok(!/bg-\[var\(--nu-accent-soft\)\]/.test(idle.slice(0, idle.indexOf("Drag and drop"))), "the highlight is not applied when idle");
});

test("drop zone: each selected file shows its name, type, size and a remove button; email conversations are labelled", async () => {
  const html = await renderView({ files: [fakeFile("Quote thread.eml", 2048), fakeFile("Outlook.msg", 5 * 1024), fakeFile("Export.pdf", 3 * MB), fakeFile("site.png", 500)] });
  assert.match(html, /aria-label="Selected attachments"/);
  for (const name of ["Quote thread.eml", "Outlook.msg", "Export.pdf", "site.png"]) {
    assert.match(html, new RegExp(`data-attachment="${name.replace(".", "\\.")}"`));
    assert.match(html, new RegExp(`aria-label="Remove ${name.replace(".", "\\.")}"`));
  }
  assert.equal((html.match(/data-email-conversation/g) ?? []).length, 2, "only the .eml and the .msg are labelled as email conversations");
  assert.equal((html.match(/Email conversation</g) ?? []).length, 2);
  assert.match(html, /<span data-file-type="[^"]*">EML<\/span>/);
  assert.match(html, /<span data-file-type="[^"]*">MSG<\/span>/);
  assert.match(html, /<span data-file-type="[^"]*">PDF<\/span>/);
  assert.match(html, /2(\.0)? KB/);
  assert.match(html, /3(\.0)? MB/);
  assert.match(html, /4 of 5 files/);
  assert.match(html, /4 files selected/);
});

test("drop zone: refusal reasons are shown in an alert; at the file limit the prompt says so; a large selection shows the email-size warning", async () => {
  const withErrors = await renderView({ errors: ['"run.exe" is not an allowed file type.', '"big.pdf" is larger than 10 MB.'] });
  assert.match(withErrors, /role="alert"/);
  assert.match(withErrors, /run\.exe/);
  assert.match(withErrors, /big\.pdf/);
  const full = await renderView({ files: Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.pdf`, 100, i)) });
  assert.match(full, /Maximum of 5 files attached/);
  assert.ok(!/>browse</.test(full));
  const heavy = await renderView({ files: [fakeFile("a.pdf", 9 * MB), fakeFile("b.pdf", 9 * MB)] });
  assert.match(heavy, /role="status"[^>]*>[^<]*(email|attachments)/i);
});

test("drop zone: while the form is submitting it cannot be focused, opened or changed", async () => {
  const html = await renderView({ disabled: true, files: [fakeFile("a.pdf")] });
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /cursor-not-allowed/);
  assert.match(html, /aria-label="Remove a\.pdf"[^>]*disabled|disabled=""[^>]*aria-label="Remove a\.pdf"/);
});

test("file names are escaped, never interpreted as markup", async () => {
  const html = await renderView({ files: [fakeFile('<img src=x onerror=alert(1)>.pdf')] });
  assert.ok(!/<img src=x/.test(html));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;\.pdf/);
});

// ---------------------------------------------------------------- the drop zone behaviour

test("drop: dropped files are handed to the form once, the drag highlight ends, and the browser's own file handling is prevented", async () => {
  const { props, added } = await zoneHandlers();
  const a = fakeFile("a.eml");
  const b = fakeFile("b.pdf");
  const drop = dragEvent(["Files"], { length: 2, 0: a, 1: b });
  props.onDrop(drop);
  assert.equal(drop.calls.prevented, 1, "without this the browser would open the dropped file and lose the form");
  assert.deepEqual(added, [[a, b]]);
});

test("drop: an empty drop (or a drop of text) adds nothing", async () => {
  const { props, added } = await zoneHandlers();
  props.onDrop(dragEvent(["text/plain"], { length: 0 }));
  props.onDrop(dragEvent(["Files"], undefined));
  assert.deepEqual(added, []);
});

test("drop: while submitting a drop is swallowed and adds nothing", async () => {
  const { props, added } = await zoneHandlers({ disabled: true });
  const e = dragEvent(["Files"], { length: 1, 0: fakeFile("a.pdf") });
  props.onDrop(e);
  assert.deepEqual(added, []);
  assert.equal(e.calls.prevented, 1, "still prevented so the browser does not navigate to the file");
});

test("drag over: files are accepted as a copy; anything else is not claimed; drag-enter claims only file drags", async () => {
  const { props } = await zoneHandlers();
  const files = dragEvent(["Files"]);
  props.onDragOver(files);
  assert.equal(files.calls.prevented, 1);
  assert.equal(files.dataTransfer.dropEffect, "copy");
  const text = dragEvent(["text/plain"]);
  props.onDragOver(text);
  props.onDragEnter(text);
  assert.equal(text.calls.prevented, 0);
  const enter = dragEvent(["Files"]);
  props.onDragEnter(enter);
  assert.equal(enter.calls.prevented, 1);
});

test("picker: clicking, Enter and Space open the file chooser; other keys and keys from inside do not; a disabled zone never opens it", async () => {
  const { props, clicks } = await zoneHandlers();
  props.onBrowse();
  assert.equal(clicks.length, 1);
  for (const key of ["Enter", " "]) {
    let prevented = false;
    const target = {};
    props.onZoneKeyDown({ key, target, currentTarget: target, preventDefault: () => (prevented = true) });
    assert.ok(prevented, `${JSON.stringify(key)} is handled`);
  }
  assert.equal(clicks.length, 3);
  const target = {};
  props.onZoneKeyDown({ key: "a", target, currentTarget: target, preventDefault: () => assert.fail("not handled") });
  props.onZoneKeyDown({ key: "Enter", target: {}, currentTarget: target, preventDefault: () => assert.fail("a key pressed on a child is not the zone's") });
  assert.equal(clicks.length, 3);
  const disabled = await zoneHandlers({ disabled: true });
  disabled.props.onZoneKeyDown({ key: "Enter", target, currentTarget: target, preventDefault: () => assert.fail("disabled") });
  assert.equal(disabled.clicks.length, 0);
});

test("picker: chosen files are handed to the form and the input is reset so the same file can be chosen again", async () => {
  const { props, added } = await zoneHandlers();
  const f = fakeFile("a.pdf");
  const target = { files: { length: 1, 0: f }, value: "C:\\fakepath\\a.pdf" };
  props.onInputChange({ target });
  assert.deepEqual(added, [[f]]);
  assert.equal(target.value, "");
  const none = { files: { length: 0 }, value: "x" };
  props.onInputChange({ target: none });
  assert.equal(added.length, 1, "cancelling the chooser adds nothing");
});

test("remove: the index of the clicked file is passed on", async () => {
  const removed = [];
  const { props } = await zoneHandlers({ onRemove: (i) => removed.push(i) });
  props.onRemove(2);
  assert.deepEqual(removed, [2]);
});

// ---------------------------------------------------------------- additional CC addresses: the helper

test("addCcEmails: one or several valid addresses are added lower-cased, in order; separators are commas, semicolons, spaces and line breaks", async () => {
  const { addCcEmails } = await load("/src/utils/invoiceRequestCcEmails.ts");
  assert.deepEqual(addCcEmails([], "Client.Contact@Customer.com"), { emails: ["client.contact@customer.com"], errors: [] });
  assert.deepEqual(addCcEmails([], "a@x.com, B@y.org;c@z.co.in d@w.io\ne@v.net"), { emails: ["a@x.com", "b@y.org", "c@z.co.in", "d@w.io", "e@v.net"], errors: [] });
  assert.deepEqual(addCcEmails(["old@x.com"], "new@x.com"), { emails: ["old@x.com", "new@x.com"], errors: [] });
  assert.deepEqual(addCcEmails([], ""), { emails: [], errors: [] });
  assert.deepEqual(addCcEmails([], " ,; "), { emails: [], errors: [] });
});

test("addCcEmails: duplicates (any letter case, or already in the list, or the mandatory arun@ifluids.com) are quietly skipped", async () => {
  const { addCcEmails } = await load("/src/utils/invoiceRequestCcEmails.ts");
  assert.deepEqual(addCcEmails(["a@x.com"], "A@X.COM, b@x.com, B@x.com"), { emails: ["a@x.com", "b@x.com"], errors: [] });
  assert.deepEqual(addCcEmails([], "ARUN@ifluids.com, extra@x.com"), { emails: ["extra@x.com"], errors: [] });
});

test("addCcEmails: the mandatory arun@ifluids.com is never added, in any casing, with surrounding whitespace, inside a list, or when already present", async () => {
  const { addCcEmails, MANDATORY_CC_EMAIL } = await load("/src/utils/invoiceRequestCcEmails.ts");
  assert.equal(MANDATORY_CC_EMAIL, "arun@ifluids.com");
  for (const typed of ["arun@ifluids.com", "ARUN@IFLUIDS.COM", "Arun@Ifluids.com", "   arun@ifluids.com  ", "\tArun@iFluids.com\n", "a@x.com, ARUN@ifluids.com ; b@x.com"]) {
    const { emails, errors } = addCcEmails([], typed);
    assert.ok(!emails.includes("arun@ifluids.com"), JSON.stringify(typed));
    assert.deepEqual(errors, [], JSON.stringify(typed));
  }
  assert.deepEqual(addCcEmails([], "a@x.com, ARUN@ifluids.com ; b@x.com").emails, ["a@x.com", "b@x.com"], "the other addresses in the same input are still added, in order");
});

test("addCcEmails: info@ifluids.com is no longer reserved here — it stays a valid optional CC (added once, any casing, and still de-duplicated)", async () => {
  const { addCcEmails } = await load("/src/utils/invoiceRequestCcEmails.ts");
  assert.deepEqual(addCcEmails([], "info@ifluids.com"), { emails: ["info@ifluids.com"], errors: [] });
  assert.deepEqual(addCcEmails([], " INFO@ifluids.com , Info@Ifluids.com "), { emails: ["info@ifluids.com"], errors: [] });
  assert.deepEqual(addCcEmails(["info@ifluids.com"], "INFO@ifluids.com, arun@ifluids.com, z@x.com"), { emails: ["info@ifluids.com", "z@x.com"], errors: [] });
});

test("addCcEmails: invalid entries are reported by name and not added, the valid ones in the same input still are", async () => {
  const { addCcEmails } = await load("/src/utils/invoiceRequestCcEmails.ts");
  const r = addCcEmails([], "good@x.com, not-an-email, a@b, @x.com, Name<tag@x.com>");
  assert.deepEqual(r.emails, ["good@x.com"]);
  assert.ok(r.errors.some((e) => e.includes('"not-an-email" is not a valid email address.')));
  assert.ok(r.errors.some((e) => e.includes('"a@b"')));
  assert.ok(r.errors.some((e) => e.includes('"@x.com"')));
  assert.equal(r.errors.length, 4);
  for (const e of r.errors) assert.ok(!/[\r\n]/.test(e));
});

test("addCcEmails: at most 10 addresses; the rest are refused with a message; input is never mutated", async () => {
  const { addCcEmails, MAX_ADDITIONAL_CC_EMAILS } = await load("/src/utils/invoiceRequestCcEmails.ts");
  assert.equal(MAX_ADDITIONAL_CC_EMAILS, 10);
  const twelve = Array.from({ length: 12 }, (_, i) => `p${i}@x.com`).join(",");
  const r = addCcEmails([], twelve);
  assert.equal(r.emails.length, 10);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /at most 10 additional CC addresses/);
  const current = Object.freeze(["a@x.com"]);
  assert.deepEqual(addCcEmails(current, "b@x.com").emails, ["a@x.com", "b@x.com"]);
  assert.deepEqual(current, ["a@x.com"]);
});

test("addCcEmails: control characters in a refused entry never reach a message", async () => {
  const { addCcEmails } = await load("/src/utils/invoiceRequestCcEmails.ts");
  const r = addCcEmails([], "bad\u0000value@x");
  assert.equal(r.emails.length, 0);
  for (const e of r.errors) assert.ok(!/[\u0000-\u001f]/.test(e));
});

// ---------------------------------------------------------------- additional CC addresses: the view

const renderCc = async (over = {}) => {
  const { CcEmailInput } = await load(CC);
  return renderToStaticMarkup(React.createElement(CcEmailInput, { emails: [], draft: "", errors: [], disabled: false, onDraftChange: noop, onCommit: noop, onRemove: noop, ...over }));
};

test("CC input: empty state has a labelled field, the placeholder and the note that arun@ifluids.com is always included", async () => {
  const html = await renderCc();
  assert.match(html, /<label[^>]*for="([^"]+)"[^>]*>Additional CC Email Addresses<\/label>/);
  const id = /<label[^>]*for="([^"]+)"/.exec(html)[1];
  assert.match(html, new RegExp(`<input[^>]*id="${id.replace(/[:]/g, "\\$&")}"`));
  assert.match(html, /name@company\.com/);
  assert.match(html, /arun@ifluids\.com is always included automatically/);
  assert.ok(!/info@ifluids\.com/.test(html), "the old mandatory address is no longer advertised");
  assert.match(html, /receives this email, including its attachments/);
  assert.ok(!/aria-label="Additional CC addresses added"/.test(html));
  assert.match(html, /aria-invalid="false"/);
});

test("CC input: added addresses are shown as removable chips with a count", async () => {
  const html = await renderCc({ emails: ["a@x.com", "b@y.org"] });
  assert.match(html, /data-cc-email="a@x\.com"/);
  assert.match(html, /data-cc-email="b@y\.org"/);
  assert.match(html, /aria-label="Remove a@x\.com from CC"/);
  assert.match(html, /aria-label="Remove b@y\.org from CC"/);
  assert.match(html, /2 of 10 added\./);
});

test("CC input: errors are announced and mark the field invalid; at the maximum the field says so; disabled while submitting", async () => {
  const bad = await renderCc({ errors: ['"nope" is not a valid email address.'] });
  assert.match(bad, /role="alert"/);
  assert.match(bad, /&quot;nope&quot; is not a valid email address\./);
  assert.match(bad, /aria-invalid="true"/);
  const full = await renderCc({ emails: Array.from({ length: 10 }, (_, i) => `p${i}@x.com`) });
  assert.match(full, /Maximum of 10 addresses added/);
  const busy = await renderCc({ emails: ["a@x.com"], disabled: true });
  assert.match(busy, /<input[^>]*disabled/);
  assert.match(busy, /aria-label="Remove a@x\.com from CC"[^>]*disabled|disabled=""[^>]*aria-label="Remove a@x\.com from CC"/);
});

test("CC input: addresses are escaped, never interpreted as markup", async () => {
  const html = await renderCc({ emails: ['"><script>alert(1)</script>@x.com'] });
  assert.ok(!/<script>alert/.test(html));
});

test("CC input source: Enter / comma / semicolon / space add the address, Enter never submits the form, a pasted list is added at once, blur adds the pending text", () => {
  const cc = src("pages/Projects/components/Invoice/CcEmailInput.tsx");
  assert.match(cc, /event\.key === "Enter" \|\| event\.key === "," \|\| event\.key === ";" \|\| event\.key === " "/);
  assert.match(cc, /Enter in this field must never submit the whole request form/);
  assert.match(cc, /onPaste=\{onPaste\}/);
  assert.match(cc, /onBlur=\{\(\) => draft\.trim\(\)\.length > 0 && onCommit\(draft\)\}/);
  assert.match(cc, /isComposing/, "an input-method composition is not interrupted");
});

// ---------------------------------------------------------------- the modal

test("modal: additional CC addresses go into the request only when there are some; the pending text is added (or blocks sending) first", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  assert.match(modal, /\.\.\.\(additionalCcEmails\.length > 0 && \{ additionalCcEmails \}\)/, "a request without extra addresses is exactly what it was before");
  assert.match(modal, /if \(ccDraft\.trim\(\)\.length > 0\) \{[\s\S]*addCcEmails\(ccEmails, ccDraft\)[\s\S]*if \(result\.errors\.length > 0\) return;[\s\S]*additionalCcEmails = result\.emails;/);
  const returnAt = modal.indexOf("if (result.errors.length > 0) return;");
  assert.ok(returnAt > 0 && returnAt < modal.indexOf("setIsSubmitting(true)"), "an invalid pending address stops the send before anything is submitted");
});

test("modal: a file dragged onto the page outside the drop zone is not opened by the browser, and the drop zone and CC field are wired to the form's state", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  assert.match(modal, /onDragOver=\{\(e\) => dragCarriesFiles\(e\.dataTransfer\?\.types\) && e\.preventDefault\(\)\}/);
  assert.match(modal, /onDrop=\{\(e\) => dragCarriesFiles\(e\.dataTransfer\?\.types\) && e\.preventDefault\(\)\}/);
  assert.match(modal, /<AttachmentDropZone files=\{attachments\} errors=\{attachmentErrors\} disabled=\{isSubmitting\} onFilesAdded=\{handleFilesAdded\} onRemove=\{handleRemoveAttachment\} \/>/);
  assert.match(modal, /const result = addAttachments\(attachments, chosen\);/, "drops and the picker share one validation path");
  assert.match(modal, /<CcEmailInput[\s\S]*emails=\{ccEmails\}[\s\S]*draft=\{ccDraft\}[\s\S]*errors=\{ccErrors\}[\s\S]*disabled=\{isSubmitting\}/);
});

test("service: additionalCcEmails is part of the typed payload and travels in the same JSON/multipart payload as the other fields", () => {
  const svc = src("services/invoiceRequestService.ts");
  assert.match(svc, /additionalCcEmails\?: string\[\];/);
});

test("the two CC mechanisms stay separate: the PMO-user picker (ccMemberUserIds) and its always-included note are unchanged", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  assert.ok(modal.includes("arun@ifluids.com is automatically included for Invoice Request Assigned emails and cannot be removed."));
  assert.ok(!modal.includes("info@ifluids.com"), "the modal no longer names info@ifluids.com");
  assert.match(modal, /ccMemberUserIds,\n/);
  assert.match(modal, /handleAddCcMember/);
});
