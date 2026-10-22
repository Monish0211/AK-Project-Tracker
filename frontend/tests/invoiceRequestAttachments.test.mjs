// Request Invoice attachments (Oct 2026): selection limits and file-type validation, the JSON-versus-multipart submission, the
// honest email-outcome display, and the unchanged no-attachment behaviour. No browser: the pure helpers and the real service run
// as-is (fetch is replaced by a recorder), the status indicator is rendered server-side, and the modal — whose Portal needs a real
// document — is checked structurally from its source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const MB = 1024 * 1024;
let vite;
let load;
let React;
let renderToStaticMarkup;
const realFetch = globalThis.fetch;

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
afterEach(() => {
  globalThis.fetch = realFetch;
});

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n"); // checkouts may use CRLF
const fakeFile = (name, size, lastModified = 1) => ({ name, size, lastModified });

// ---------------------------------------------------------------- selection rules

test("limits are exactly 5 files / 10 MB each / 20 MB total, and the allowed types are the approved list", async () => {
  const m = await load("/src/utils/invoiceRequestAttachments.ts");
  assert.deepEqual({ ...m.ATTACHMENT_LIMITS }, { maxFiles: 5, maxFileBytes: 10 * MB, maxTotalBytes: 20 * MB });
  assert.deepEqual([...m.ALLOWED_ATTACHMENT_EXTENSIONS].sort(), [".csv", ".doc", ".docx", ".jpeg", ".jpg", ".pdf", ".png", ".ppt", ".pptx", ".txt", ".xls", ".xlsx"]);
  assert.equal(m.ATTACHMENT_ACCEPT, ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg");
});

test("valid files are added with no errors, in the order chosen, and the existing selection is kept", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  const current = [fakeFile("a.pdf", 1000)];
  const result = addAttachments(current, [fakeFile("b.DOCX", 2000), fakeFile("c.png", 3000)]);
  assert.deepEqual(result.files.map((f) => f.name), ["a.pdf", "b.DOCX", "c.png"]);
  assert.deepEqual(result.errors, []);
  assert.equal(current.length, 1, "the input array is never mutated");
});

test("each invalid file is skipped with its own clear message and the good ones are still added", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  const result = addAttachments([], [
    fakeFile("ok.pdf", 100),
    fakeFile("run.exe", 100),
    fakeFile("page.html", 100),
    fakeFile("empty.pdf", 0),
    fakeFile("huge.pdf", 10 * MB + 1),
    fakeFile("noextension", 100),
  ]);
  assert.deepEqual(result.files.map((f) => f.name), ["ok.pdf"]);
  assert.equal(result.errors.length, 5);
  assert.match(result.errors[0], /"run\.exe" is not an allowed file type\. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT, PNG, JPG, JPEG\./);
  assert.match(result.errors[1], /"page\.html" is not an allowed file type/);
  assert.match(result.errors[2], /"empty\.pdf" is empty/);
  assert.match(result.errors[3], /"huge\.pdf" is 10\.0 MB — each file must be 10 MB or smaller/);
  assert.match(result.errors[4], /"noextension" is not an allowed file type/);
});

test("exactly 10 MB per file is allowed; the 6th file and a file that would pass 20 MB in total are refused", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  assert.equal(addAttachments([], [fakeFile("edge.pdf", 10 * MB)]).errors.length, 0);

  const five = addAttachments([], Array.from({ length: 5 }, (_, i) => fakeFile(`f${i}.pdf`, 100)));
  assert.equal(five.files.length, 5);
  const sixth = addAttachments(five.files, [fakeFile("f5.pdf", 100)]);
  assert.equal(sixth.files.length, 5);
  assert.match(sixth.errors[0], /at most 5 files/);

  const full = addAttachments([], [fakeFile("a.pdf", 10 * MB), fakeFile("b.pdf", 10 * MB)]);
  assert.equal(full.files.length, 2, "exactly 20 MB in total is allowed");
  const over = addAttachments(full.files, [fakeFile("c.pdf", 1)]);
  assert.equal(over.files.length, 2);
  assert.match(over.errors[0], /over the 20 MB total limit/);
});

test("choosing the same file twice is refused (and a different file with the same name is allowed)", async () => {
  const { addAttachments } = await load("/src/utils/invoiceRequestAttachments.ts");
  const once = addAttachments([], [fakeFile("a.pdf", 100, 5)]);
  const again = addAttachments(once.files, [fakeFile("a.pdf", 100, 5)]);
  assert.equal(again.files.length, 1);
  assert.match(again.errors[0], /already added/);
  const different = addAttachments(once.files, [fakeFile("a.pdf", 200, 6)]);
  assert.equal(different.files.length, 2);
});

test("the email-size warning is non-blocking and only appears for a large selection", async () => {
  const { emailSizeWarning, formatFileSize } = await load("/src/utils/invoiceRequestAttachments.ts");
  assert.equal(emailSizeWarning([{ size: 14 * MB }]), null);
  const warning = emailSizeWarning([{ size: 10 * MB }, { size: 6 * MB }]);
  assert.match(warning, /16\.0 MB/);
  assert.match(warning, /may be too large to attach to the notification email/);
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(5 * MB), "5.0 MB");
});

// ---------------------------------------------------------------- submission: JSON unchanged, multipart only with files

function recordFetch(responseBody = { success: true, data: { id: "req-1" } }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responseBody), { status: 201, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}

test("without files the submission is the plain JSON request, exactly as before", async () => {
  const calls = recordFetch();
  const { createInvoiceRequest } = await load("/src/services/invoiceRequestService.ts");
  const payload = { assignedToUserId: "u1", ccMemberUserIds: ["u2"], notes: "hi" };
  const created = await createInvoiceRequest("p1", payload);
  assert.equal(created.id, "req-1");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/projects\/p1\/invoice-requests$/);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.body, JSON.stringify(payload), "the body is the same JSON the request has always sent");

  const viaEmptyList = recordFetch();
  await createInvoiceRequest("p1", payload, []);
  assert.equal(viaEmptyList[0].init.headers["Content-Type"], "application/json", "an empty file list is still the JSON path");
});

test("with files it is ONE multipart request: the same JSON as a 'payload' field plus every file; no manual Content-Type", async () => {
  const calls = recordFetch();
  const { createInvoiceRequest } = await load("/src/services/invoiceRequestService.ts");
  const payload = { assignedToUserId: "u1", notes: "see attached" };
  const a = new File([new Uint8Array([1, 2, 3])], "Invoice details.pdf", { type: "application/pdf" });
  const b = new File([new Uint8Array([4, 5])], "po.xlsx");
  await createInvoiceRequest("p1", payload, [a, b]);

  assert.equal(calls.length, 1);
  const { init } = calls[0];
  assert.equal(init.method, "POST");
  assert.ok(init.body instanceof FormData);
  assert.equal(init.headers["Content-Type"], undefined, "the browser must set the multipart boundary itself");
  assert.equal(init.body.get("payload"), JSON.stringify(payload));
  const files = init.body.getAll("files");
  assert.deepEqual(files.map((f) => [f.name, f.size]), [["Invoice details.pdf", 3], ["po.xlsx", 2]]);
});

test("the multipart upload has its own, longer timeout (the JSON default is 30 s)", () => {
  const service = src("services/invoiceRequestService.ts");
  assert.match(service, /UPLOAD_TIMEOUT_MS = 180_000/);
  assert.match(service, /apiClient\.postFormData<InvoiceRequest>[^\n]*\{ timeoutMs: UPLOAD_TIMEOUT_MS \}/);
  const client = src("services/apiClient.ts");
  assert.match(client, /requestFormData[\s\S]*requestOptions\.timeoutMs \?\? DEFAULT_TIMEOUT_MS/, "postFormData honours a per-call timeout");
});

test("a server rejection surfaces as an error the form can show (never a success)", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: "\"run.exe\" is not an allowed file type." }), { status: 400, headers: { "Content-Type": "application/json" } });
  const { createInvoiceRequest } = await load("/src/services/invoiceRequestService.ts");
  const { getUserFriendlyErrorMessage } = await load("/src/utils/errorMessage.ts");
  await assert.rejects(
    () => createInvoiceRequest("p1", { assignedToUserId: "u1" }, [new File([new Uint8Array([1])], "a.pdf")]),
    (error) => {
      assert.match(getUserFriendlyErrorMessage(error), /not an allowed file type/);
      return true;
    }
  );
});

// ---------------------------------------------------------------- the status indicator never claims more than is known

async function renderIndicator(over) {
  const { InvoiceRequestStatusIndicator } = await load("/src/pages/Projects/components/Invoice/InvoiceRequestStatusIndicator.tsx");
  const request = { id: "r", status: "Open", attachments: [], emailStatus: "sent", emailDetail: null, ...over };
  return renderToStaticMarkup(React.createElement(InvoiceRequestStatusIndicator, { invoiceRequest: request }));
}

test("indicator: a normal request shows only 'Invoice Requested' — as before", async () => {
  for (const emailStatus of ["sent", "sent_with_attachments", null]) {
    const html = await renderIndicator({ emailStatus });
    assert.match(html, /Invoice Requested/);
    assert.ok(!/email/i.test(html), `no email note for ${emailStatus}`);
  }
  assert.equal(await renderIndicator({ status: "Completed" }), "");
});

test("indicator: failed, unconfirmed and sent-without-attachments are each stated plainly, with the server's detail as a tooltip", async () => {
  const failed = await renderIndicator({ emailStatus: "failed", emailDetail: "refused" });
  assert.match(failed, /Notification email failed/);
  assert.match(failed, /title="refused"/);
  assert.match(await renderIndicator({ emailStatus: "unconfirmed" }), /Email delivery unconfirmed/);
  assert.match(await renderIndicator({ emailStatus: "sent_without_attachments" }), /Email sent without attachments/);
});

test("indicator: 'pending' is never shown as sent — it reads 'Sending…' for a request with files and nothing for one without", async () => {
  const withFiles = await renderIndicator({ emailStatus: "pending", attachments: [{ id: "d", fileName: "a.pdf", fileSizeBytes: 1 }] });
  assert.match(withFiles, /Sending email with attachments/);
  assert.ok(!/notified|sent\b/i.test(withFiles.replace(/Sending email with attachments/g, "")), "never claims delivery");
  const without = await renderIndicator({ emailStatus: "pending", attachments: [] });
  assert.ok(!/email/i.test(without));
});

// ---------------------------------------------------------------- the modal

test("modal: the Attachments section sits after Special Note and before the Cancel / Send Request actions; every existing field remains", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  const order = [
    modal.indexOf("<FormLabel>Special Note (optional)</FormLabel>"),
    modal.indexOf('data-testid="request-invoice-attachments"'),
    modal.indexOf("<FormLabel>Attachments (optional)</FormLabel>"),
    modal.indexOf(">\n              Cancel\n"),
    modal.lastIndexOf("Send Request"),
  ];
  assert.ok(order.every((i) => i >= 0), `missing marker(s): ${order}`);
  assert.deepEqual([...order].sort((x, y) => x - y), order, "markers appear in the required order");

  for (const label of ["Client Name", "Project No.", "Project Name", "Client Contact Name", "Phone Number", "E-mail Id", "Send Invoice To", "CC Members", "Invoice Amount", "Number of Copies Required", "Reports/Drawings Available on the Server", "Report Printing Details", "Address", "Special Note (optional)"]) {
    assert.ok(modal.includes(label), `existing label "${label}" is still present`);
  }
  assert.ok(modal.includes("info@ifluids.com is always included automatically and cannot be removed."));
  assert.match(modal, /disabled=\{!assignedToUserId \|\| isSubmitting\}/, "submit stays disabled until a person is chosen and while sending (duplicate-submit guard)");
});

test("modal: a file picker with multiple selection, the approved accept list, per-file remove buttons and the limits shown", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  assert.match(modal, /type="file"[\s\S]*multiple[\s\S]*accept=\{ATTACHMENT_ACCEPT\}/);
  assert.match(modal, /aria-label=\{`Remove \$\{file\.name\}`\}/);
  assert.match(modal, /formatFileSize\(file\.size\)/, "each selected file shows its size");
  assert.match(modal, /ALLOWED_ATTACHMENT_LABELS/);
  assert.match(modal, /role="alert"/, "validation errors are announced");
  assert.match(modal, /createInvoiceRequest\(\s*project\.id,\s*\{[\s\S]*\},\s*attachments\s*\)/, "the selected files go to the service together with the existing fields");
});

test("modal: no attachments keeps the original success message; with attachments it never claims the person was notified", () => {
  const modal = src("pages/Projects/components/Invoice/RequestInvoiceModal.tsx");
  assert.match(modal, /if \(attachments\.length === 0\) \{\s*showToast\(\{ type: "success", title: "Invoice request sent", message: "The responsible person has been notified\." \}\);/);
  const withFiles = modal.slice(modal.indexOf('title: "Invoice request saved"'));
  const message = withFiles.slice(0, withFiles.indexOf("onSubmitted(created)"));
  assert.match(message, /is being sent/);
  assert.ok(!/has been notified/.test(message));
});

test("no portal download or document link is added anywhere for these attachments", () => {
  for (const file of ["pages/Projects/components/Invoice/RequestInvoiceModal.tsx", "pages/Projects/components/Invoice/InvoiceRequestStatusIndicator.tsx", "services/invoiceRequestService.ts"]) {
    const text = src(file);
    assert.ok(!/downloadDocument|getBlob|\/documents\//.test(text), `${file} must not link to a download`);
  }
});
