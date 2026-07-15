export interface ProjectNote {
  id: string;
  projectId: string;
  message: string;
  createdBy: string;
  createdAt: string; // ISO datetime string
}
