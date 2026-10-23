import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/utils/AppError.js";
import { classifySendFailure } from "../../shared/email/email.service.js";
import { buildInvoiceRequestAssignedEmail } from "../../shared/email/templates/invoiceRequestAssigned.template.js";
import {
  ALLOWED_ATTACHMENT_TYPES,
  INVOICE_REQUEST_ATTACHMENT_LIMITS,
  emailContentTypeFor,
  estimateEncodedAttachmentBytes,
  estimateEmailBytes,
  fitsEmailLimit,
  formatFileSize,
  isEmailConversationFileName,
  looksLikeEmailMessage,
  sanitizeAttachmentFileName,
  validateAttachmentFiles,
  type UploadedAttachment,
} from "./invoiceRequestAttachments.rules.js";

/**
 * Request Invoice attachments (Oct 2026) — pure rules: limits, real-content (signature) checks, file-name safety, email-size maths,
 * SMTP failure classification and email-body escaping. No database, no network, no mail.
 */

const MB = 1024 * 1024;

const pdf = (size = 1000) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(Math.max(0, size - 9), 0x20)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const ole = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
const openXml = (folder: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`[Content_Types].xml ${folder}document.xml`), Buffer.alloc(64)]);
const plainZip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("notes.txt"), Buffer.alloc(64)]);

function file(name: string, buffer: Buffer, mimetype = "application/octet-stream"): UploadedAttachment {
  return { originalname: name, mimetype, size: buffer.length, buffer };
}

function rejects(files: UploadedAttachment[], status: number, messagePart: RegExp | string) {
  assert.throws(
    () => validateAttachmentFiles(files),
    (error: unknown) => {
      assert.ok(error instanceof AppError, "must be an AppError");
      assert.equal(error.statusCode, status);
      assert.match(error.message, typeof messagePart === "string" ? new RegExp(messagePart) : messagePart);
      return true;
    }
  );
}

test("the approved limits are exactly 5 files / 10 MB each / 20 MB total", () => {
  assert.deepEqual(INVOICE_REQUEST_ATTACHMENT_LIMITS, { maxFiles: 5, maxFileBytes: 10 * MB, maxTotalBytes: 20 * MB });
  assert.deepEqual(Object.keys(ALLOWED_ATTACHMENT_TYPES).sort(), [".csv", ".doc", ".docx", ".eml", ".jpeg", ".jpg", ".msg", ".png", ".pdf", ".ppt", ".pptx", ".txt", ".xls", ".xlsx"].sort(), "the approved types plus .eml and .msg (email conversations)");
});

test("every allowed type with a genuine signature is accepted, and its content type comes from the allowlist, not the browser", () => {
  const result = validateAttachmentFiles([
    file("a.pdf", pdf(), "text/html"), // a lying browser MIME type is ignored
    file("b.docx", openXml("word/")),
    file("c.xlsx", openXml("xl/")),
    file("d.pptx", openXml("ppt/")),
    file("e.doc", ole()),
  ]);
  assert.deepEqual(
    result.map((f) => [f.fileName, f.contentType]),
    [
      ["a.pdf", "application/pdf"],
      ["b.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["c.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["d.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["e.doc", "application/msword"],
    ]
  );
  const more = validateAttachmentFiles([
    file("f.xls", ole()),
    file("g.ppt", ole()),
    file("h.png", png()),
    file("i.jpg", jpg()),
    file("j.JPEG", jpg()),
  ]);
  assert.deepEqual(more.map((f) => f.contentType), ["application/vnd.ms-excel", "application/vnd.ms-powerpoint", "image/png", "image/jpeg", "image/jpeg"]);
  const text = validateAttachmentFiles([file("k.csv", Buffer.from("a,b\n1,2\n")), file("l.txt", Buffer.from("hello"))]);
  assert.deepEqual(text.map((f) => f.contentType), ["text/csv", "text/plain"]);
});

test("no files is valid (uploads are optional)", () => {
  assert.deepEqual(validateAttachmentFiles([]), []);
});

test("more than 5 files is rejected", () => {
  rejects(Array.from({ length: 6 }, (_, i) => file(`f${i}.pdf`, pdf())), 400, /at most 5 files/);
});

test("types outside the allowlist are rejected, with the allowed list in the message", () => {
  for (const name of ["x.exe", "x.html", "x.svg", "x.zip", "x.js", "x.bat", "x.iso", "x.lnk", "x.docm", "x.xlsm", "x.pdf.exe", "noextension"]) {
    rejects([file(name, pdf())], 400, /not an allowed file type[\s\S]*PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT, PNG, JPG, JPEG/);
  }
});

test("a blocked browser-reported MIME type is rejected even on an allowed extension", () => {
  rejects([file("x.pdf", pdf(), "application/x-msdownload")], 400, /not an allowed file type/);
});

test("empty files are rejected", () => {
  rejects([file("empty.pdf", Buffer.alloc(0))], 400, /empty/);
  rejects([file("empty.txt", Buffer.alloc(0))], 400, /empty/);
});

test("per-file limit: 10 MB is allowed, one byte more is 413", () => {
  assert.equal(validateAttachmentFiles([file("ok.pdf", pdf(10 * MB))]).length, 1);
  rejects([file("big.pdf", pdf(10 * MB + 1))], 413, /larger than 10 MB/);
});

test("total limit: 20 MB is allowed, over it is 413", () => {
  assert.equal(validateAttachmentFiles([file("a.pdf", pdf(10 * MB)), file("b.pdf", pdf(10 * MB))]).length, 2);
  rejects([file("a.pdf", pdf(10 * MB)), file("b.pdf", pdf(10 * MB)), file("c.pdf", pdf(10))], 413, /total more than 20 MB/);
});

test("spoofed contents are rejected: an executable named .pdf / .png / .docx, a plain zip named .docx, binary named .txt", () => {
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 0x90)]);
  rejects([file("invoice.pdf", exe)], 400, /does not look like a real PDF/);
  rejects([file("logo.png", exe)], 400, /real PNG/);
  rejects([file("photo.jpg", pdf())], 400, /real JPG/);
  rejects([file("report.docx", exe)], 400, /real DOCX/);
  rejects([file("report.docx", plainZip())], 400, /real DOCX/); // a zip that is not a Word document
  rejects([file("sheet.xlsx", openXml("word/"))], 400, /real XLSX/); // a Word package renamed to Excel
  rejects([file("notes.txt", exe)], 400, /real TXT/);
  rejects([file("notes.csv", pdf())], 400, /real CSV/);
  rejects([file("notes.txt", Buffer.from([0x61, 0x62, 0x00, 0x63]))], 400, /real TXT/); // NUL bytes = not text
});

test("UTF-16 text with a byte-order mark is still accepted as text", () => {
  const utf16 = Buffer.from("\ufeffa,b\n1,2\n", "utf16le");
  assert.equal(validateAttachmentFiles([file("export.csv", utf16)]).length, 1);
});

test("file names are made safe: no directories, control characters, header/markup characters or leading dots", () => {
  assert.equal(sanitizeAttachmentFileName("../../etc/passwd.pdf"), "passwd.pdf");
  assert.equal(sanitizeAttachmentFileName("C:\\Users\\x\\inv.pdf"), "inv.pdf");
  assert.equal(sanitizeAttachmentFileName("evil\r\nBcc: attacker@example.com.pdf"), "evilBcc_ attacker@example.com.pdf");
  assert.ok(!/[\r\n]/.test(sanitizeAttachmentFileName("a\r\nb.pdf")));
  assert.equal(sanitizeAttachmentFileName('<script>"x".pdf'), "_script__x_.pdf");
  assert.equal(sanitizeAttachmentFileName(".htaccess.pdf"), "htaccess.pdf");
  assert.equal(sanitizeAttachmentFileName("a\u202egpj.pdf"), "agpj.pdf"); // right-to-left override removed
  assert.equal(sanitizeAttachmentFileName("///"), ""); // nothing usable left
  assert.equal(sanitizeAttachmentFileName(".pdf"), "pdf"); // a bare extension loses its dot — it then has no allowed extension and is rejected
  const long = sanitizeAttachmentFileName(`${"x".repeat(300)}.pdf`);
  assert.ok(long.length <= 120 && long.endsWith(".pdf"));
  // multer decodes the multipart filename as latin1; UTF-8 names are repaired
  assert.equal(sanitizeAttachmentFileName(Buffer.from("Rapport été.pdf", "utf8").toString("latin1")), "Rapport été.pdf");
  assert.equal(sanitizeAttachmentFileName("Rapport été.pdf"), "Rapport été.pdf");
});

test("a malicious name never reaches the result, and a name that becomes empty is rejected", () => {
  const [f] = validateAttachmentFiles([file("../../evil\r\n<b>.pdf", pdf())]);
  assert.ok(f);
  assert.ok(!/[\\/\r\n<>]/.test(f.fileName));
  rejects([file("///", pdf())], 400, /no usable file name/);
  rejects([file(".pdf", pdf())], 400, /not an allowed file type/);
});

test("duplicate names are made unique (case-insensitive) so two attachments never share one name", () => {
  const result = validateAttachmentFiles([file("a.pdf", pdf()), file("A.pdf", pdf()), file("a.pdf", pdf())]);
  assert.deepEqual(result.map((f) => f.fileName), ["a.pdf", "A (2).pdf", "a (3).pdf"]);
});

test("email size accounts for base64 + MIME overhead, so the approved upload ceiling cannot be assumed to fit", () => {
  assert.ok(estimateEncodedAttachmentBytes(3 * MB) > 3 * MB * (4 / 3), "encoded size is larger than 4/3 of the raw size");
  const html = 6000;
  const maxEmail = 20 * MB;
  assert.equal(fitsEmailLimit([14 * MB], html, maxEmail), true, "14 MB of files still fits a 20 MB message");
  assert.equal(fitsEmailLimit([16 * MB], html, maxEmail), false, "16 MB of files encodes to more than 20 MB");
  assert.equal(fitsEmailLimit([10 * MB, 10 * MB], html, maxEmail), false, "the full 20 MB upload allowance does NOT fit a 20 MB message");
  assert.ok(estimateEmailBytes([MB], html) > estimateEncodedAttachmentBytes(MB), "the body and headers count too");
});

test("formatFileSize", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(5 * MB), "5.0 MB");
});

test("SMTP failures are classified conservatively: only definitive answers are 'safe', anything unknown is 'unconfirmed'", () => {
  const err = (props: Record<string, unknown>, message = "failed") => Object.assign(new Error(message), props);
  assert.equal(classifySendFailure(err({ responseCode: 552, response: "552 5.3.4 Message size exceeds fixed limit" })), "size_rejected");
  assert.equal(classifySendFailure(err({ responseCode: 552 })), "size_rejected");
  assert.equal(classifySendFailure(err({ responseCode: 554, response: "554 5.3.4 Message too large for this system" })), "size_rejected");
  assert.equal(classifySendFailure(err({ responseCode: 550, response: "550 mailbox unavailable" })), "rejected");
  assert.equal(classifySendFailure(err({ responseCode: 451, response: "451 try later" })), "rejected");
  assert.equal(classifySendFailure(err({ code: "EAUTH" })), "rejected");
  assert.equal(classifySendFailure(err({ code: "EENVELOPE" })), "rejected");
  // the exact shapes real Nodemailer produces (observed against a local SMTP sink):
  assert.equal(classifySendFailure(err({ code: "ESOCKET", command: "CONN", syscall: "connect", errno: -4078 }, "connect ECONNREFUSED 127.0.0.1:25")), "rejected"); // never connected
  assert.equal(classifySendFailure(err({ code: "ESOCKET", command: "CONN", syscall: "getaddrinfo" }, "getaddrinfo ENOTFOUND smtp.invalid")), "rejected"); // host name did not resolve
  assert.equal(classifySendFailure(err({ code: "ECONNECTION", command: "CONN" }, "Connection closed unexpectedly")), "unconfirmed"); // dropped, maybe after the body
  assert.equal(classifySendFailure(err({ code: "ETIMEDOUT", command: "CONN" }, "Timeout")), "unconfirmed");
  assert.equal(classifySendFailure(new Error("Unexpected socket close")), "unconfirmed");
  // unknown outcome — the message may have been accepted
  assert.equal(classifySendFailure(err({ code: "ETIMEDOUT", command: "DATA" })), "unconfirmed");
  assert.equal(classifySendFailure(err({ code: "ESOCKET" })), "unconfirmed");
  assert.equal(classifySendFailure(err({ code: "ECONNECTION", command: "DATA" })), "unconfirmed");
  assert.equal(classifySendFailure(new Error("something odd")), "unconfirmed");
  assert.equal(classifySendFailure(undefined), "unconfirmed");
});

const baseEmail = {
  assignedToName: "Asha",
  requesterName: "Ravi",
  prNo: "PR-1",
  projectTitle: "Plant A",
  client: "Client Ltd",
  clientContactName: null,
  clientContactPhone: null,
  clientContactEmail: null,
  invoiceAmountNote: null,
  copiesRequired: null,
  drawingsAvailable: null,
  printingDetails: null,
  address: null,
  notes: null,
  invoicesUrl: "http://localhost/projects/edit/1",
};

test("email: without attachments there is no Attachments section at all (the email is as it was)", () => {
  const { html, subject } = buildInvoiceRequestAssignedEmail(baseEmail);
  assert.equal(subject, "Invoice Request — please raise this invoice");
  assert.ok(!/Attachments/i.test(html));
  assert.ok(!/could NOT be attached/.test(html));
});

test("email: user-entered values and file names are HTML-escaped", () => {
  const evil = `<img src=x onerror=alert(1)>`;
  const { html } = buildInvoiceRequestAssignedEmail({
    ...baseEmail,
    requesterName: evil,
    client: evil,
    notes: evil,
    address: `"><script>alert(2)</script>`,
    attachments: { mode: "attached", files: [{ fileName: `${evil}.pdf`, sizeLabel: "1 KB" }] },
  });
  assert.ok(!html.includes("<img src=x"), "raw markup must not appear");
  assert.ok(!html.includes("<script>alert(2)"), "raw script must not appear");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("email: attached mode lists the files; not_attached mode says plainly they could not be attached and never claims receipt", () => {
  const files = [{ fileName: "Invoice details.pdf", sizeLabel: "2.0 MB" }, { fileName: "po.xlsx", sizeLabel: "80 KB" }];
  const attached = buildInvoiceRequestAssignedEmail({ ...baseEmail, attachments: { mode: "attached", files } }).html;
  assert.match(attached, /Attachments \(2\)/);
  assert.ok(attached.includes("Invoice details.pdf") && attached.includes("po.xlsx") && attached.includes("2.0 MB"));
  assert.ok(!/could NOT be attached/.test(attached));

  const notAttached = buildInvoiceRequestAssignedEmail({
    ...baseEmail,
    attachments: { mode: "not_attached", files, notAttachedReason: "The mail server rejected the message as too large." },
  }).html;
  assert.match(notAttached, /could NOT be attached to this email/);
  assert.match(notAttached, /rejected the message as too large/);
  assert.match(notAttached, /ask the requester to send them to you directly/);
  assert.ok(!/Attachments \(\d\)/.test(notAttached), "must not present the files as attached");
});

// ───────── Email conversations (.eml / .msg / PDF) ─────────

const eml = (body = "Please raise the invoice.\r\n", headers?: string[]) =>
  Buffer.from(
    (headers ?? [
      "From: Asha <asha@example.com>",
      "To: Priya <priya@example.com>",
      "Subject: Re: Invoice for PR-123",
      "Date: Fri, 23 Oct 2026 10:00:00 +0530",
      "Message-ID: <abc@example.com>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
    ]).join("\r\n") +
      "\r\n\r\n" +
      body
  );
const OLE8 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const msg = () => Buffer.concat([OLE8, Buffer.alloc(512), Buffer.from("__properties_version1.0", "utf16le"), Buffer.alloc(64)]);

test("a saved email (.eml) is accepted, stored as message/rfc822, and recognised as an email conversation", () => {
  const [accepted] = validateAttachmentFiles([file("Re Invoice request.eml", eml(), "message/rfc822")]);
  assert.deepEqual([accepted!.fileName, accepted!.contentType], ["Re Invoice request.eml", "message/rfc822"]);
  assert.ok(isEmailConversationFileName("Re Invoice request.eml"));
  assert.ok(isEmailConversationFileName("THREAD.EML"));
  assert.equal(isEmailConversationFileName("scan.pdf"), false, "a PDF is a document; whether it is an email export is the sender's word, not guessed");
  // the real-world variants of the same thing
  for (const variant of [
    eml("body\n", ["From: a@example.com", "Subject: x"]), // minimal: two headers
    Buffer.from("From: a@example.com\nTo: b@example.com\nSubject: LF-only line endings\n\nbody\n"), // LF line endings
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), eml()]), // UTF-8 byte-order mark
    eml("", ["Received: from mail.example.com by mx.example.com; Fri, 23 Oct 2026 10:00:00 +0530", "Return-Path: <a@example.com>"]), // headers only, no body
    eml("x", ["X-Unsent: 1", "To: someone@example.com", "Subject: Draft saved from Outlook", "  folded continuation line"]),
    Buffer.from("From: a@example.com\r\nTo: b@example.com\r\nSubject: =?UTF-8?B?w6l0w6k=?=\r\n\r\n\u00e9t\u00e9 body in UTF-8"),
  ]) {
    assert.equal(validateAttachmentFiles([file("m.eml", variant)]).length, 1);
  }
});

test("an .eml is only accepted when it really is an email message: other text, markup, scripts and binaries renamed .eml are refused", () => {
  const notEmail: [string, Buffer][] = [
    ["plain text note", Buffer.from("Note: remember to call the client\r\nthanks\r\n")],
    ["a single header-looking line", Buffer.from("Subject: only one line\r\n\r\nbody")],
    ["no headers at all", Buffer.from("Hello,\r\nplease raise the invoice.\r\n")],
    ["html page", Buffer.from("<html><body><script>alert(1)</script></body></html>")],
    ["a script", Buffer.from("#!/bin/sh\nrm -rf /\n")],
    ["a header block that stops being headers", Buffer.from("From: a@example.com\r\nTo: b@example.com\r\nthis line is not a header\r\n\r\nbody")],
    ["a space before the colon", Buffer.from("From : a@example.com\r\nTo : b@example.com\r\n\r\nbody")],
    ["a continuation line with nothing to continue", Buffer.from(" folded\r\nFrom: a@example.com\r\nTo: b@example.com\r\n\r\n")],
    ["an mbox 'From ' line", Buffer.from("From a@example.com Fri Oct 23 10:00:00 2026\r\nSubject: x\r\n\r\nbody")],
    ["only unknown headers", Buffer.from("X-One: 1\r\nX-Two: 2\r\n\r\nbody")],
    ["a leading blank line", Buffer.from("\r\nFrom: a@example.com\r\nTo: b@example.com\r\n\r\nbody")],
    ["binary data with a NUL", Buffer.concat([eml(), Buffer.from([0x00, 0x01])])],
    ["a Windows executable", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)])],
    ["a PDF", pdf()],
    ["a zip", plainZip()],
    ["a PNG", png()],
  ];
  for (const [label, buffer] of notEmail) rejects([file("x.eml", buffer)], 400, /does not look like a real EML file/);
  // header block longer than any real one with no blank line
  rejects([file("x.eml", Buffer.concat([eml("", ["From: a@example.com", "To: b@example.com"]).subarray(0, -2), Buffer.from(`X-Pad: ${"a".repeat(70000)}\r\n`)]))], 400, /does not look like a real EML file/);
  rejects([file("x.eml", eml(), "application/x-msdownload")], 400, /not an allowed file type/, );
});

test("an Outlook message (.msg) needs the full Compound File header AND the MAPI properties stream; a renamed Word / Excel file or anything else is refused", () => {
  const [accepted] = validateAttachmentFiles([file("Conversation.msg", msg(), "application/vnd.ms-outlook")]);
  assert.deepEqual([accepted!.fileName, accepted!.contentType], ["Conversation.msg", "application/vnd.ms-outlook"]);
  assert.ok(isEmailConversationFileName("Conversation.msg"));
  const refused: [string, Buffer][] = [
    ["a legacy .doc / .xls (Compound File without the properties stream)", Buffer.concat([OLE8, Buffer.alloc(600)])],
    ["only the first four bytes of the signature", Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(100), Buffer.from("__properties_version1.0", "utf16le")])],
    ["the marker text in an ordinary file", Buffer.from("this file mentions __properties_version1.0 but is not an Outlook message")],
    ["the marker in the wrong encoding", Buffer.concat([OLE8, Buffer.alloc(100), Buffer.from("__properties_version1.0", "latin1")])],
    ["a Windows executable", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 1)])],
    ["a zip", plainZip()],
    ["an email saved as text", eml()],
  ];
  for (const [label, buffer] of refused) rejects([file("x.msg", buffer)], 400, /does not look like a real MSG file/);
  rejects([file("x.msg", msg(), "application/x-msdownload")], 400, /not an allowed file type/);
  // the existing Office types are unchanged by this
  assert.equal(validateAttachmentFiles([file("old.doc", Buffer.concat([OLE8, Buffer.alloc(600)]))])[0]!.contentType, "application/msword");
});

test("a PDF export of an email conversation is just a PDF: it needs nothing new and is checked as before", () => {
  assert.equal(validateAttachmentFiles([file("Conversation export.pdf", pdf())])[0]!.contentType, "application/pdf");
  rejects([file("Conversation export.pdf", eml())], 400, /does not look like a real PDF file/);
});

test("email conversations share the ordinary limits: 5 files, 10 MB each, 20 MB total, no empty file, a safe unique name", () => {
  const six = [file("a.eml", eml()), file("b.msg", msg()), file("c.pdf", pdf()), file("d.png", png()), file("e.txt", Buffer.from("t")), file("f.eml", eml())];
  rejects(six, 400, /at most 5 files/);
  assert.equal(validateAttachmentFiles(six.slice(0, 5)).length, 5);
  rejects([file("empty.eml", Buffer.alloc(0))], 400, /is empty/);
  const big = Buffer.concat([eml(), Buffer.alloc(10 * MB, 0x61)]);
  rejects([file("big.eml", big)], 413, /larger than 10 MB/);
  const names = validateAttachmentFiles([file("Thread.eml", eml()), file("thread.EML", eml())]).map((f) => f.fileName);
  assert.deepEqual(names, ["Thread.eml", "thread (2).EML"], "two files never share a name in the email");
  assert.equal(validateAttachmentFiles([file("../../etc/passwd/Thread.eml", eml())])[0]!.fileName, "Thread.eml", "no directory part survives");
  rejects([file(".eml", eml())], 400, /no usable file name|not an allowed/);
});

test("looksLikeEmailMessage reads only the header block: it never needs, parses or runs the body", () => {
  const hostileBody = "<script>alert(1)</script>\r\n" + "A".repeat(200000) + "\u0000\u0001binary and %PDF- and MZ inside the body";
  assert.equal(looksLikeEmailMessage(Buffer.from(eml(hostileBody).toString("latin1"), "latin1")), true, "whatever the body holds, the verdict is about the headers");
  assert.equal(looksLikeEmailMessage(Buffer.alloc(0)), false);
});

test("an email is SENT as an opaque attachment: message/* becomes application/octet-stream (base64, never rendered), every other type is unchanged", () => {
  assert.equal(emailContentTypeFor("message/rfc822"), "application/octet-stream");
  assert.equal(emailContentTypeFor("MESSAGE/RFC822"), "application/octet-stream");
  assert.equal(emailContentTypeFor("message/partial"), "application/octet-stream");
  for (const type of ["application/pdf", "application/vnd.ms-outlook", "image/png", "text/plain", "text/csv", "application/msword"]) assert.equal(emailContentTypeFor(type), type);
});

test("the notification email tags an email conversation in its attachment list, escaped; other files are listed exactly as before", () => {
  const html = buildInvoiceRequestAssignedEmail({
    assignedToName: "Priya", requesterName: "Asha", prNo: "PR-1", projectTitle: "T", client: "C", clientContactName: null, clientContactPhone: null, clientContactEmail: null,
    invoiceAmountNote: null, copiesRequired: null, drawingsAvailable: null, printingDetails: null, address: null, notes: null, invoicesUrl: "https://x.test/p",
    attachments: { mode: "attached", files: [{ fileName: "Re thread.eml", sizeLabel: "4 KB", kindLabel: "Email conversation" }, { fileName: "scan.pdf", sizeLabel: "2 KB" }, { fileName: "x.msg", sizeLabel: "9 KB", kindLabel: "<b>x</b>" }] },
  }).html;
  assert.match(html, /Re thread\.eml <span[^>]*>\(Email conversation · 4 KB\)<\/span>/);
  assert.match(html, /scan\.pdf <span[^>]*>\(2 KB\)<\/span>/, "no tag on a plain document");
  assert.match(html, /\(&lt;b&gt;x&lt;\/b&gt; · 9 KB\)/, "the tag is escaped like every other value");
  assert.equal(/<b>x<\/b>/.test(html), false);
});
