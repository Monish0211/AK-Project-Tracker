/**
 * Metadata only — mirrors exactly what the backend's list/upload endpoints
 * return (see Backend document.service.ts's toDocumentDto()). storageKey and
 * any filesystem path are never sent to the frontend at all.
 */
export interface ProjectDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
}
