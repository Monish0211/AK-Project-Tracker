/**
 * Project / PR Request document upload rules (Nov 2026), shared by Add Project, Edit Project and PR Request so all of them accept
 * and refuse exactly the same files with the same messages. The backend re-checks every rule (it is the authority); this only
 * refuses early, before anything is sent.
 *
 *  - Size: at most DOCUMENT_MAX_FILE_SIZE_MB per file. Must equal the backend's DOCUMENT_UPLOAD_MAX_FILE_SIZE_MB default.
 *  - Type: the backend's blocked executable/script extensions are refused here too (backend documents.constants.ts
 *    BLOCKED_EXTENSIONS). Every other business document type stays allowed, as before. The backend additionally verifies the
 *    content of PDF / Office / image files against their extension.
 */
export const DOCUMENT_MAX_FILE_SIZE_MB = 100;
export const DOCUMENT_MAX_FILE_SIZE_BYTES = DOCUMENT_MAX_FILE_SIZE_MB * 1024 * 1024;

/** Upload and download of one document may take minutes for a large file on a slow link (nginx allows 900 s). */
export const DOCUMENT_TRANSFER_TIMEOUT_MS = 15 * 60 * 1000;

export const DOCUMENT_BLOCKED_EXTENSIONS: readonly string[] = [".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".cpl", ".dll", ".ps1", ".vbs", ".js", ".jar", ".app", ".sh"];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Why a file cannot be uploaded, or null when it may be. */
export function documentFileProblem(file: Pick<File, "name" | "size">): string | null {
  if (file.size === 0) return "The file is empty.";
  if (file.size > DOCUMENT_MAX_FILE_SIZE_BYTES) return `The file is ${formatFileSize(file.size)}; the maximum is ${DOCUMENT_MAX_FILE_SIZE_MB} MB per file.`;
  const ext = extensionOf(file.name);
  if (DOCUMENT_BLOCKED_EXTENSIONS.includes(ext)) return `${ext} files cannot be uploaded (executable or script files are not allowed).`;
  return null;
}

/** Identity of a picked file, used to ignore the same file being picked or dropped twice. */
export function fileIdentity(file: Pick<File, "name" | "size" | "lastModified">): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export interface FileSelection<F> {
  accepted: F[];
  rejected: { file: F; reason: string }[];
  /** Files skipped because the same file is already selected, uploading or uploaded. */
  duplicates: F[];
}

/**
 * Splits a picked / dropped batch into the files to accept, the ones refused (with the reason) and duplicates. `taken` holds the
 * identities already selected or uploading; `uploaded` holds "name|size" of documents already stored on this Project / PR Request.
 * Duplicates inside the same batch are also skipped, so a double drop or double pick can never upload a file twice.
 */
export function selectDocumentFiles<F extends Pick<File, "name" | "size" | "lastModified">>(
  files: readonly F[],
  taken: ReadonlySet<string>,
  uploaded: ReadonlySet<string> = new Set()
): FileSelection<F> {
  const seen = new Set(taken);
  const result: FileSelection<F> = { accepted: [], rejected: [], duplicates: [] };
  for (const file of files) {
    const problem = documentFileProblem(file);
    if (problem) {
      result.rejected.push({ file, reason: problem });
      continue;
    }
    const id = fileIdentity(file);
    if (seen.has(id) || uploaded.has(`${file.name}|${file.size}`)) {
      result.duplicates.push(file);
      continue;
    }
    seen.add(id);
    result.accepted.push(file);
  }
  return result;
}
