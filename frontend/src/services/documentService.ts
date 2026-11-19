import { apiClient } from "./apiClient";
import type { UploadProgress } from "./apiClient";
import type { ProjectDocument } from "../types/Document";
import { DOCUMENT_TRANSFER_TIMEOUT_MS } from "../utils/documentUpload";

export function listProjectDocuments(projectId: string): Promise<ProjectDocument[]> {
  return apiClient.get<ProjectDocument[]>(`/projects/${projectId}/documents`);
}

export function listPRRequestDocuments(prRequestId: string): Promise<ProjectDocument[]> {
  return apiClient.get<ProjectDocument[]>(`/pr-requests/${prRequestId}/documents`);
}

function buildUploadFormData(file: File): FormData {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

/** One file per request (unchanged API). Reports upload progress; allows a large file time to travel (see DOCUMENT_TRANSFER_TIMEOUT_MS). */
export function uploadProjectDocument(projectId: string, file: File, onProgress?: (progress: UploadProgress) => void): Promise<ProjectDocument> {
  return apiClient.postFormDataWithProgress<ProjectDocument>(`/projects/${projectId}/documents`, buildUploadFormData(file), onProgress, {
    timeoutMs: DOCUMENT_TRANSFER_TIMEOUT_MS,
  });
}

export function uploadPRRequestDocument(prRequestId: string, file: File, onProgress?: (progress: UploadProgress) => void): Promise<ProjectDocument> {
  return apiClient.postFormDataWithProgress<ProjectDocument>(`/pr-requests/${prRequestId}/documents`, buildUploadFormData(file), onProgress, {
    timeoutMs: DOCUMENT_TRANSFER_TIMEOUT_MS,
  });
}

export function deleteDocument(documentId: string): Promise<null> {
  return apiClient.delete<null>(`/documents/${documentId}`);
}

/**
 * Triggers a real browser download of an authenticated document — a plain
 * <a href> can't carry the Bearer token this backend requires (see
 * apiClient.ts's own comment on getBlob()), so this fetches the file as a
 * Blob first, then uses the same createObjectURL + synthetic <a> + revoke
 * pattern already used by ReportExportButtons.tsx for its (client-generated,
 * unauthenticated) CSV export. A large document (up to 100 MB) gets the same long transfer timeout as its upload.
 */
export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const blob = await apiClient.getBlob(`/documents/${documentId}/download`, { timeoutMs: DOCUMENT_TRANSFER_TIMEOUT_MS });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
