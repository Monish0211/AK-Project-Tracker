import type { Request, Response } from "express";
import { asyncHandler } from "../../../shared/utils/asyncHandler.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { requireUser } from "../../../shared/utils/requireUser.js";
import * as documentService from "../services/document.service.js";

function requireUploadedFile(req: Request) {
  const file = req.file;
  if (!file) {
    throw new AppError("A file is required.", 400);
  }
  return file;
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || typeof value !== "string") {
    throw new AppError(`${name} is required.`, 400);
  }
  return value;
}

export const uploadProjectDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = requireParam(req, "projectId");
  const file = requireUploadedFile(req);
  const document = await documentService.uploadDocumentForProject(projectId, file, user);
  res.status(201).json({ success: true, data: document, message: "Document uploaded successfully." });
});

export const uploadPRRequestDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const prRequestId = requireParam(req, "prRequestId");
  const file = requireUploadedFile(req);
  const document = await documentService.uploadDocumentForPRRequest(prRequestId, file, user);
  res.status(201).json({ success: true, data: document, message: "Document uploaded successfully." });
});

export const listProjectDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const projectId = requireParam(req, "projectId");
  const documents = await documentService.listDocumentsForProject(projectId, user);
  res.status(200).json({ success: true, data: documents });
});

export const listPRRequestDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const prRequestId = requireParam(req, "prRequestId");
  const documents = await documentService.listDocumentsForPRRequest(prRequestId, user);
  res.status(200).json({ success: true, data: documents });
});

export const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = requireParam(req, "id");
  const { filePath, fileName, mimeType } = await documentService.getDocumentForDownload(id, user);
  res.download(filePath, fileName, (err) => {
    // res.download() may have already started writing the response by the
    // time a "file vanished from disk" error surfaces — only attempt a JSON
    // error response if nothing has been sent yet, matching Express's own
    // documented res.download() error-handling caveat.
    if (err && !res.headersSent) {
      res.status(404).json({ success: false, message: "The document file could not be found." });
    }
  });
  void mimeType; // Content-Type is set by res.download() from fileName's extension; mimeType is informational only.
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  requireUser(req);
  const id = requireParam(req, "id");
  await documentService.deleteDocument(id);
  res.status(200).json({ success: true, data: null, message: "Document deleted successfully." });
});
