import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env.js";

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
 */
const storageDir = path.resolve(env.DOCUMENT_STORAGE_PATH);

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(storageDir, { recursive: true });
}

export function generateStorageKey(): string {
  // No extension kept on the physical file — mimeType (already validated
  // and stored on the Document row) is the source of truth for what the
  // file is; nothing ever needs to inspect the physical filename itself.
  return randomUUID();
}

export async function writeDocumentFile(storageKey: string, buffer: Buffer): Promise<void> {
  await ensureStorageDir();
  await fs.writeFile(path.join(storageDir, storageKey), buffer);
}

/**
 * Best-effort delete — a missing file is logged and treated as success
 * (nothing left to clean up), never thrown, per the agreed deletion
 * behavior: a Document row must never become undeletable just because its
 * physical file already disappeared some other way.
 */
export async function deleteDocumentFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(path.join(storageDir, storageKey));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[documents] Physical file for storageKey ${storageKey} was already missing — nothing to delete.`);
      return;
    }
    throw err;
  }
}

export function readDocumentFilePath(storageKey: string): string {
  return path.join(storageDir, storageKey);
}
