import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGstClaudeResponse } from "./validators/gstClaudeResponse.validators.js";
import { buildGstExtractionCandidate } from "./services/gstExtractionAdapter.service.js";
import { validateGstDocumentUpload } from "./services/gstFileValidation.service.js";
import { AppError } from "../../shared/utils/AppError.js";

/**
 * Pure unit tests — no HTTP server, no database, no real Anthropic API call.
 * The parser/adapter pair is the "sensor, not decision-maker" boundary
 * (mirrors pdfImport's own claudeResponse.validators.ts/
 * pdfImportResponseAdapter.service.ts): given a raw string shaped like a
 * real Claude reply, does parsing + confidence-capping behave correctly.
 * This deliberately does NOT exercise a live Claude call — same disclosed
 * boundary pdfImport's own claudeExtraction.service.ts already carries
 * ("NOT YET VERIFIED against the real Anthropic API") — see the feature's
 * final report for why that's an accepted scope limit, not an oversight.
 */

function makeMulterFile(overrides: Partial<Express.Multer.File> & { buffer: Buffer; originalname: string }): Express.Multer.File {
  return {
    fieldname: "file",
    encoding: "7bit",
    mimetype: "application/octet-stream",
    size: overrides.buffer.length,
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
    ...overrides,
  };
}

test("parseGstClaudeResponse — happy path with all four fields present", () => {
  const raw = JSON.stringify({
    gstNumber: "33AAAAA0000A1Z5",
    legalName: "ABC ENGINEERING PRIVATE LIMITED",
    tradeName: "ABC ENGINEERING",
    state: "Tamil Nadu",
  });

  const parsed = parseGstClaudeResponse(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data!.gstNumber, "33AAAAA0000A1Z5");
  assert.equal(parsed.data!.legalName, "ABC ENGINEERING PRIVATE LIMITED");
  assert.equal(parsed.data!.tradeName, "ABC ENGINEERING");
  assert.equal(parsed.data!.state, "Tamil Nadu");
});

test("parseGstClaudeResponse — partial extraction (some fields null) is NOT an error", () => {
  const raw = JSON.stringify({ gstNumber: "33AAAAA0000A1Z5", legalName: null, tradeName: null, state: null });
  const parsed = parseGstClaudeResponse(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data!.gstNumber, "33AAAAA0000A1Z5");
  assert.equal(parsed.data!.legalName, null);
});

test("parseGstClaudeResponse — strips a markdown code fence Claude sometimes adds anyway", () => {
  const raw = "```json\n" + JSON.stringify({ gstNumber: "33AAAAA0000A1Z5", legalName: null, tradeName: null, state: null }) + "\n```";
  const parsed = parseGstClaudeResponse(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data!.gstNumber, "33AAAAA0000A1Z5");
});

test("parseGstClaudeResponse — invalid JSON is a total failure, not a partial result", () => {
  const parsed = parseGstClaudeResponse("this is not json at all {{{");
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failureReason);
});

test("parseGstClaudeResponse — wrong shape (e.g. an array) is a total failure", () => {
  const parsed = parseGstClaudeResponse(JSON.stringify(["not", "an", "object"]));
  assert.equal(parsed.ok, false);
});

test("buildGstExtractionCandidate — found fields cap confidence at 70 and carry the verify warning", () => {
  const candidate = buildGstExtractionCandidate({
    gstNumber: "33AAAAA0000A1Z5",
    legalName: "ABC ENGINEERING PRIVATE LIMITED",
    tradeName: null,
    state: "Tamil Nadu",
  });

  assert.equal(candidate.gstNumber.value, "33AAAAA0000A1Z5");
  assert.equal(candidate.gstNumber.confidence, 70);
  assert.equal(candidate.gstNumber.source, "ai");
  assert.deepEqual(candidate.gstNumber.warnings, ["AI-suggested value — please verify."]);

  // Never a claim of validity — only ever the "please verify" warning text.
  assert.ok(!candidate.gstNumber.warnings!.some((w) => /valid|verified|registered/i.test(w)));
});

test("buildGstExtractionCandidate — a field Claude didn't find is confidence 0, empty value, no warning", () => {
  const candidate = buildGstExtractionCandidate({ gstNumber: null, legalName: null, tradeName: null, state: null });
  assert.equal(candidate.gstTradeName.value, "");
  assert.equal(candidate.gstTradeName.confidence, 0);
  assert.equal(candidate.gstTradeName.warnings, undefined);
});

test("validateGstDocumentUpload — accepts a real PDF and identifies its kind", () => {
  const file = makeMulterFile({
    originalname: "gst-cert.pdf",
    buffer: Buffer.from("%PDF-1.4\n...", "utf-8"),
  });
  assert.equal(validateGstDocumentUpload(file), "pdf");
});

test("validateGstDocumentUpload — accepts a real PNG and identifies its kind", () => {
  const file = makeMulterFile({
    originalname: "gst-cert.png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  assert.equal(validateGstDocumentUpload(file), "png");
});

test("validateGstDocumentUpload — accepts a real JPEG and identifies its kind", () => {
  const file = makeMulterFile({
    originalname: "gst-cert.jpg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  });
  assert.equal(validateGstDocumentUpload(file), "jpeg");
});

test("validateGstDocumentUpload — rejects an unsupported extension outright", () => {
  const file = makeMulterFile({ originalname: "gst-cert.docx", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]) });
  assert.throws(() => validateGstDocumentUpload(file), (err) => err instanceof AppError && err.statusCode === 400);
});

test("validateGstDocumentUpload — rejects a spoofed extension whose bytes don't match (magic-byte mismatch)", () => {
  const file = makeMulterFile({ originalname: "gst-cert.pdf", buffer: Buffer.from([0x00, 0x00, 0x00, 0x00]) });
  assert.throws(() => validateGstDocumentUpload(file), (err) => err instanceof AppError && err.statusCode === 400);
});

test("validateGstDocumentUpload — rejects an empty file", () => {
  const file = makeMulterFile({ originalname: "gst-cert.pdf", buffer: Buffer.alloc(0) });
  assert.throws(() => validateGstDocumentUpload(file), (err) => err instanceof AppError && err.statusCode === 400);
});

test("validateGstDocumentUpload — rejects a file over the configured size ceiling", () => {
  const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 0x41)]); // > 10MB default
  const file = makeMulterFile({ originalname: "gst-cert.pdf", buffer: oversized });
  assert.throws(() => validateGstDocumentUpload(file), (err) => err instanceof AppError && err.statusCode === 400);
});

test("validateGstDocumentUpload — no file at all is rejected", () => {
  assert.throws(() => validateGstDocumentUpload(undefined), (err) => err instanceof AppError && err.statusCode === 400);
});
