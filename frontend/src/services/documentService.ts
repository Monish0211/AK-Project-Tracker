import { apiClient } from "./apiClient";
import type { ProjectDocument } from "../types/Document";

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

export function uploadProjectDocument(projectId: string, file: File): Promise<ProjectDocument> {
  return apiClient.postFormData<ProjectDocument>(`/projects/${projectId}/documents`, buildUploadFormData(file));
}

export function uploadPRRequestDocument(prRequestId: string, file: File): Promise<ProjectDocument> {
  return apiClient.postFormData<ProjectDocument>(`/pr-requests/${prRequestId}/documents`, buildUploadFormData(file));
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
 * unauthenticated) CSV export.
 */
export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const blob = await apiClient.getBlob(`/documents/${documentId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
