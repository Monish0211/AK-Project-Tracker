/**
 * File-validation approach for the Documents feature — a DENYLIST, not a
 * business-category allowlist (confirmed business requirement: normal
 * project/business documents of any kind — invoices, quotations, drawings,
 * specifications, PDFs, Word/Excel files, images — must never be blocked
 * just because they don't match a narrow "expected" category). Only
 * executable/script formats are blocked, checked by extension AND by a
 * denylist of executable-associated MIME types a browser/OS may report.
 *
 * No new dependency was added for this: Node has no built-in file-type
 * sniffer, and none of this backend's existing dependencies (multer,
 * exceljs, pdf-parse, etc.) expose one either — see MAGIC_BYTE_SIGNATURES
 * below for the small, dependency-free signature check used instead.
 */
export const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".msi",
  ".cpl",
  ".dll",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
  ".app",
  ".sh",
]);

export const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "application/vnd.microsoft.portable-executable",
  "application/java-archive",
]);

/**
 * Magic-byte (file-signature) verification for the handful of formats the
 * business requirement explicitly names (PDF, Word/Excel — both legacy OLE
 * and modern Zip-based, images). Deliberately NOT exhaustive and NOT a
 * second allowlist gate — a file whose signature doesn't match any entry
 * here is not rejected for that reason alone (many legitimate business
 * formats, e.g. plain .csv/.txt, have no fixed signature at all); this only
 * catches the specific, common spoofing case of a renamed executable
 * pretending to be one of these named formats via its extension/MIME type.
 */
export const MAGIC_BYTE_SIGNATURES: { name: string; extensions: string[]; signature: number[] }[] = [
  { name: "PDF", extensions: [".pdf"], signature: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // Modern Word/Excel (.docx/.xlsx) and legacy OpenOffice formats are all
  // Zip containers — same signature, distinguished by extension only.
  { name: "Zip-based Office document", extensions: [".docx", ".xlsx", ".pptx"], signature: [0x50, 0x4b, 0x03, 0x04] },
  // Legacy .doc/.xls — OLE Compound File Binary Format.
  { name: "Legacy Office document", extensions: [".doc", ".xls"], signature: [0xd0, 0xcf, 0x11, 0xe0] },
  { name: "PNG image", extensions: [".png"], signature: [0x89, 0x50, 0x4e, 0x47] },
  { name: "JPEG image", extensions: [".jpg", ".jpeg"], signature: [0xff, 0xd8, 0xff] },
  { name: "GIF image", extensions: [".gif"], signature: [0x47, 0x49, 0x46, 0x38] },
];

export function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}
