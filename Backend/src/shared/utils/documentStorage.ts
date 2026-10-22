import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env.js";
import { AppError } from "./AppError.js";

/**
 * Physical file I/O for the Documents feature — the ONLY module that ever
 * touches env.DOCUMENT_STORAGE_PATH directly. Every write uses a
 * server-generated opaque key (never the caller-supplied original filename)
 * so a path-traversal attempt via a crafted filename (e.g. "../../etc/passwd")
 * can never reach the filesystem — the original name is stored purely as
 * display metadata on the Document row, never passed to any fs call here.
 *
 * The directory itself is resolved once (relative paths resolve against the
 * backend's cwd, matching every other relative-path convention in this repo)
 * and created on first use — local development needs zero manual setup.
 * Production's real path (/home/ifluids-pmodashboard/storage/documents) is
 * a sibling of htdocs/, confirmed outside every Nginx location/root/alias
 * mapping via a separate read-only production check; this module has no
 * awareness of Nginx at all, it just writes wherever DOCUMENT_STORAGE_PATH
 * points.
 *
 * PR-number subdirectories (Oct 2026) — Project documents are physically
 * organized as `<storageDir>/<safe prNo>/<uuid>`; PR Request and Customer
 * documents are untouched and remain flat (`<storageDir>/<uuid>`), exactly
 * as before this change. The subdirectory is ALWAYS derived live from the
 * caller-supplied, already-sanitized prNo at the moment of each read/write/
 * delete — it is never persisted into Document.storageKey (which continues
 * to store only the bare UUID for every document type, unchanged). This is
 * deliberate: Document.projectId -> Project.id -> Project.prNo remains the
 * single authoritative source of the current PR number, so a later prNo
 * edit can never leave a stale folder name baked into the database — see
 * renameProjectDocumentFolder() below, called from project.service.ts's
 * updateProject() whenever prNo actually changes.
 */
const storageDir = path.resolve(env.DOCUMENT_STORAGE_PATH);

// Project.prNo has no format restriction beyond "starts with the PR
// Category's prefix and has something after it" (see
// validatePrCategoryPrNoRule in project.constants.ts) — real values look
// like "PR-7087", but nothing stops a crafted direct API call from sending
// a value containing "/", "\", or "..". This allow-list REJECTS anything
// unsafe rather than transforming/escaping it, so two different raw prNo
// values can never collapse onto the same sanitized folder name.
const SAFE_PR_NO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$/;

/**
 * Validates a Project's prNo is safe to use as a physical storage
 * subdirectory name. Throws AppError(400) rather than silently stripping or
 * escaping unsafe characters.
 */
export function sanitizePrNoForStorage(prNo: string): string {
  const trimmed = prNo.trim();
  if (!SAFE_PR_NO_PATTERN.test(trimmed)) {
    throw new AppError(
      "This Project's PR Number contains characters that are not safe for document storage.",
      400
    );
  }
  return trimmed;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureStorageDir(): Promise<void> {
  await ensureDir(storageDir);
}

/**
 * Resolves the final on-disk path for a storage key, optionally inside a
 * subdirectory. The caller is expected to have already produced `subDir`
 * via sanitizePrNoForStorage() — this containment check is a structural
 * backstop, not the primary gate, so it never trusts that regardless of
 * where `subDir` came from.
 */
function resolvePath(storageKey: string, subDir?: string): string {
  const target = subDir ? path.join(storageDir, subDir, storageKey) : path.join(storageDir, storageKey);
  const resolved = path.resolve(target);
  if (resolved !== storageDir && !resolved.startsWith(storageDir + path.sep)) {
    throw new AppError("Resolved document storage path is outside the storage root.", 500);
  }
  return resolved;
}

export function generateStorageKey(): string {
  // No extension kept on the physical file — mimeType (already validated
  // and stored on the Document row) is the source of truth for what the
  // file is; nothing ever needs to inspect the physical filename itself.
  return randomUUID();
}

export async function writeDocumentFile(storageKey: string, buffer: Buffer, subDir?: string): Promise<void> {
  const target = resolvePath(storageKey, subDir);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, buffer);
}

/**
 * Best-effort delete — a missing file is logged and treated as success
 * (nothing left to clean up), never thrown, per the agreed deletion
 * behavior: a Document row must never become undeletable just because its
 * physical file already disappeared some other way.
 */
export async function deleteDocumentFile(storageKey: string, subDir?: string): Promise<void> {
  const target = resolvePath(storageKey, subDir);
  try {
    await fs.unlink(target);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[documents] Physical file for storageKey ${storageKey} was already missing — nothing to delete.`);
      return;
    }
    throw err;
  }
}

export function readDocumentFilePath(storageKey: string, subDir?: string): string {
  return resolvePath(storageKey, subDir);
}

/**
 * Project PR Number edit (e.g. PR1234 -> PR1250) — moves the whole
 * per-project folder so already-uploaded documents remain reachable under
 * the new prNo, without ever rewriting Document.storageKey (see this
 * module's own top comment). Called from project.service.ts's
 * updateProject() only when prNo actually changed; that caller treats this
 * as best-effort (logs and continues) — a storage-layer problem must never
 * block or roll back the prNo edit itself.
 */
export async function renameProjectDocumentFolder(oldPrNo: string, newPrNo: string): Promise<void> {
  const oldSafe = sanitizePrNoForStorage(oldPrNo);
  const newSafe = sanitizePrNoForStorage(newPrNo);
  if (oldSafe === newSafe) return;

  await ensureStorageDir();
  const oldDir = path.join(storageDir, oldSafe);
  const newDir = path.join(storageDir, newSafe);

  try {
    await fs.access(oldDir);
  } catch {
    return; // nothing was ever uploaded under the old PR number — nothing to move
  }

  try {
    await fs.rename(oldDir, newDir);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOTEMPTY" && code !== "EEXIST") {
      throw err;
    }
    // newDir already has files — only possible if this exact prNo string was
    // previously used by a different (now-archived or renamed) Project.
    // Merge file-by-file rather than failing the whole rename: every
    // physical filename is a random UUID, so no filename can ever collide.
    await ensureDir(newDir);
    const entries = await fs.readdir(oldDir);
    for (const entry of entries) {
      await fs.rename(path.join(oldDir, entry), path.join(newDir, entry));
    }
    await fs.rmdir(oldDir);
  }
}

/**
 * After a project is permanently deleted and its files removed: drops that project's PR-number folder if (and only if) it is now
 * empty. Best-effort and silent — a leftover empty folder is harmless, and a non-empty one (another Project that reused the same
 * PR number) must never be touched.
 */
export async function removeProjectDocumentFolderIfEmpty(prNo: string): Promise<void> {
  let safe: string;
  try {
    safe = sanitizePrNoForStorage(prNo);
  } catch {
    return; // an unsafe PR number can never have had a folder
  }
  try {
    await fs.rmdir(path.join(storageDir, safe)); // rmdir refuses a non-empty directory
  } catch {
    /* missing or not empty — nothing to do */
  }
}

/**
 * PR Request -> Project approval repoint — moves a document physically out
 * of the flat PR-Request storage area into the target Project's PR-number
 * folder, keeping it consistent with every other Project document. Called
 * from document.repository.ts's repointDocumentsToProject(), before the
 * Document row's FK is updated. Tolerates a missing source file the same
 * way deleteDocumentFile() does.
 */
export async function moveFlatDocumentIntoProjectFolder(storageKey: string, prNo: string): Promise<void> {
  const safe = sanitizePrNoForStorage(prNo);
  await ensureStorageDir();
  const targetDir = path.join(storageDir, safe);
  await ensureDir(targetDir);

  const from = path.join(storageDir, storageKey);
  const to = path.join(targetDir, storageKey);
  try {
    await fs.rename(from, to);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[documents] Physical file for storageKey ${storageKey} was already missing during PR Request -> Project repoint.`);
      return;
    }
    throw err;
  }
}
