import path from "node:path";
import { AppError } from "../../../shared/utils/AppError.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { assertProjectAccessById, assertProjectAccess } from "../../../shared/utils/projectAccess.js";
import { findProjectByIdAny } from "../../projects/repository/project.repository.js";
import { assertCanViewPRRequest } from "../../prRequests/services/prRequest.service.js";
import { findPRRequestById } from "../../prRequests/repository/prRequest.repository.js";
import { findCustomerById } from "../../customers/repository/customer.repository.js";
import {
  generateStorageKey,
  writeDocumentFile,
  deleteDocumentFile,
  readDocumentFilePath,
  sanitizePrNoForStorage,
} from "../../../shared/utils/documentStorage.js";
import { BLOCKED_EXTENSIONS, BLOCKED_MIME_TYPES, MAGIC_BYTE_SIGNATURES, matchesSignature } from "../documents.constants.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import * as repo from "../repository/document.repository.js";

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function toDocumentDto(doc: {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: Date;
  uploadedByUserId: string;
  uploadedBy: { fullName: string };
}) {
  return {
    id: doc.id,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    uploadedByUserId: doc.uploadedByUserId,
    uploadedByName: doc.uploadedBy.fullName,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Denylist validation (not a business-category allowlist — see
 * documents.constants.ts). Extension check first (cheap, catches the
 * overwhelming majority of real cases), then a best-effort magic-byte check
 * for the specific named formats this business requirement calls out — a
 * mismatch there is NOT itself a rejection (many legitimate formats have no
 * fixed signature), it only catches a renamed-executable spoofing a known
 * extension.
 */
function assertFileIsSafe(file: UploadedFile): void {
  const ext = path.extname(file.originalname).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new AppError(`Files of type "${ext}" are not allowed.`, 400);
  }
  if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
    throw new AppError("This file type is not allowed.", 400);
  }

  const matchingSignatures = MAGIC_BYTE_SIGNATURES.filter((sig) => sig.extensions.includes(ext));
  if (matchingSignatures.length > 0) {
    const matches = matchingSignatures.some((sig) => matchesSignature(file.buffer, sig.signature));
    if (!matches) {
      throw new AppError(
        `This file's contents do not match its "${ext}" extension and were rejected for safety.`,
        400
      );
    }
  }
}

async function assertPRRequestAccessById(prRequestId: string, user: AccessTokenPayload): Promise<void> {
  const existing = await findPRRequestById(prRequestId);
  if (!existing) {
    throw new AppError("PR Request not found.", 404);
  }
  assertCanViewPRRequest(existing, user);
}

/**
 * Customer Master has no per-customer ownership (global master data — every
 * holder of the "Customer Master" grant can see every customer), UNLIKE
 * Project/PR Request documents where the route's broad
 * requireModuleAccess("Projects", "Approvals", "Customer Master") OR-gate is
 * safe only because THIS function narrows back down to the caller's real
 * relationship to that specific resource. For a Customer-owned document
 * there is no per-resource ownership to narrow by — the module grant IS the
 * whole authorization rule — so this explicitly re-checks that the caller
 * holds "Customer Master" specifically, never trusting that they reached
 * this far via a different grant (e.g. "Projects" alone must NOT be enough
 * to download a GST document).
 */
async function assertCustomerAccessById(customerId: string, user: AccessTokenPayload): Promise<void> {
  const existing = await findCustomerById(customerId);
  if (!existing) {
    throw new AppError("Customer not found.", 404);
  }

  const grantCount = await prisma.userModuleAccess.count({
    where: { userId: user.sub, module: { name: "Customer Master" } },
  });
  if (grantCount === 0) {
    throw new AppError("You do not have access to this module.", 403);
  }
}

/**
 * Upload path only — the route itself already gates with a single, narrow
 * requireModuleAccess("Customer Master") (no OR with Projects/Approvals),
 * so there is no broader grant to narrow back down from here; only
 * existence needs confirming.
 */
async function assertCustomerExistsById(customerId: string): Promise<void> {
  const existing = await findCustomerById(customerId);
  if (!existing) {
    throw new AppError("Customer not found.", 404);
  }
}

/**
 * Resolves the live, current PR-number subdirectory for a Project document.
 * Deliberately a fresh lookup every time (never cached, never taken from a
 * previously-read value) — Document.projectId -> Project.id -> Project.prNo
 * stays authoritative, and prNo can change after upload (see
 * project.service.ts's updateProject(), which relocates the physical folder
 * when that happens). A Document with a non-null projectId can only exist
 * while its Project still exists (onDelete: Cascade on that relation), so a
 * missing Project here would indicate a real inconsistency — fail closed
 * rather than guess a path.
 */
async function resolveProjectDocumentSubDir(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { prNo: true } });
  if (!project) {
    throw new AppError("Document's Project could not be resolved.", 500);
  }
  return sanitizePrNoForStorage(project.prNo);
}

export async function uploadDocumentForProject(projectId: string, file: UploadedFile, user: AccessTokenPayload) {
  const project = await findProjectByIdAny(projectId);
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  await assertProjectAccess(user, project);
  assertFileIsSafe(file);
  return persistDocument({ projectId, projectPrNo: project.prNo, file, user });
}

export async function uploadDocumentForPRRequest(prRequestId: string, file: UploadedFile, user: AccessTokenPayload) {
  await assertPRRequestAccessById(prRequestId, user);
  assertFileIsSafe(file);
  return persistDocument({ prRequestId, file, user });
}

/**
 * Customer GST Registration Document (Sep 2026) — called ONLY after the
 * Customer row it attaches to already exists (either just created, or an
 * existing customer being edited); never called by the extraction endpoint
 * itself (see customerGst.controller.ts), which never persists anything.
 *
 * Replace-on-reupload: Document.customerId is @unique (one GST document per
 * customer for this release — see the approved audit's Section M), so
 * uploading a new one for a customer that already has one deletes the old
 * row + physical file FIRST, then persists the new one via the same
 * write-then-record-with-cleanup path every other Documents upload uses.
 */
export async function uploadDocumentForCustomer(customerId: string, file: UploadedFile, user: AccessTokenPayload) {
  await assertCustomerExistsById(customerId);
  assertFileIsSafe(file);

  const existing = await repo.findDocumentByCustomerId(customerId);
  if (existing) {
    await repo.deleteDocumentRow(existing.id);
    await deleteDocumentFile(existing.storageKey);
  }

  return persistDocument({ customerId, file, user });
}

/**
 * Write-then-record, with cleanup on the failure path the spec calls out
 * explicitly: if the physical write succeeds but the DB insert fails, the
 * just-written file is deleted so it never becomes an orphan; if the write
 * itself fails, no DB row is ever created.
 */
async function persistDocument(args: {
  projectId?: string;
  projectPrNo?: string;
  prRequestId?: string;
  customerId?: string;
  file: UploadedFile;
  user: AccessTokenPayload;
}) {
  const storageKey = generateStorageKey();
  // subDir is undefined (flat storage, unchanged) for PR Request/Customer
  // documents — only a Project document is ever written into a PR-number
  // folder. projectPrNo is resolved once by the caller (uploadDocumentForProject)
  // from the authoritative Project record, never trusted from the frontend.
  const subDir = args.projectPrNo ? sanitizePrNoForStorage(args.projectPrNo) : undefined;
  await writeDocumentFile(storageKey, args.file.buffer, subDir);

  try {
    const created = await repo.createDocument({
      projectId: args.projectId ?? null,
      prRequestId: args.prRequestId ?? null,
      customerId: args.customerId ?? null,
      fileName: args.file.originalname,
      storageKey,
      mimeType: args.file.mimetype,
      fileSizeBytes: args.file.size,
      uploadedByUserId: args.user.sub,
    });
    return toDocumentDto(created);
  } catch (err) {
    await deleteDocumentFile(storageKey, subDir).catch((cleanupErr) => {
      console.error(`[documents] Failed to clean up orphaned file ${storageKey} after DB insert failure:`, cleanupErr);
    });
    throw err;
  }
}

export async function listDocumentsForProject(projectId: string, user: AccessTokenPayload) {
  await assertProjectAccessById(projectId, user);
  const documents = await repo.findDocumentsByProjectId(projectId);
  return documents.map(toDocumentDto);
}

export async function listDocumentsForPRRequest(prRequestId: string, user: AccessTokenPayload) {
  await assertPRRequestAccessById(prRequestId, user);
  const documents = await repo.findDocumentsByPRRequestId(prRequestId);
  return documents.map(toDocumentDto);
}

/**
 * Download — re-checks authorization against the document's CURRENT parent
 * every time, never trusting a previously fetched list (a document can be
 * re-pointed from a PR Request onto a Project between when a list was
 * fetched and when download is clicked). Returns the physical path only
 * after that check passes; the filesystem is never touched before it.
 */
export async function getDocumentForDownload(id: string, user: AccessTokenPayload) {
  const doc = await repo.findDocumentById(id);
  if (!doc) {
    throw new AppError("Document not found.", 404);
  }

  let subDir: string | undefined;

  if (doc.projectId) {
    await assertProjectAccessById(doc.projectId, user);
    subDir = await resolveProjectDocumentSubDir(doc.projectId);
  } else if (doc.prRequestId) {
    await assertPRRequestAccessById(doc.prRequestId, user);
  } else if (doc.customerId) {
    await assertCustomerAccessById(doc.customerId, user);
  } else {
    // Should never happen (the application-layer invariant guarantees at
    // most one of Project/PR Request/Customer is set, and exactly one for
    // any row actually created through this module) — fail closed rather
    // than serve an unowned file.
    throw new AppError("Document has no associated Project, PR Request, or Customer.", 500);
  }

  return {
    filePath: readDocumentFilePath(doc.storageKey, subDir),
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  };
}

/**
 * Delete — Administrator ONLY, per the confirmed final rule: no uploader/
 * creator ownership check (uploadedByUserId is retained purely as audit
 * metadata, never consulted here). The real security control is the route's
 * own authorize("Administrator") middleware (see routes/document.routes.ts)
 * — this function only needs to confirm the document still exists before
 * removing it; Administrator already has unrestricted visibility into every
 * Project and PR Request (see hasUnrestrictedProjectVisibility /
 * assertCanViewPRRequest), so no further per-parent check narrows anything.
 */
export async function deleteDocument(id: string): Promise<void> {
  const doc = await repo.findDocumentById(id);
  if (!doc) {
    throw new AppError("Document not found.", 404);
  }

  const subDir = doc.projectId ? await resolveProjectDocumentSubDir(doc.projectId) : undefined;

  await repo.deleteDocumentRow(id);
  await deleteDocumentFile(doc.storageKey, subDir);
}
