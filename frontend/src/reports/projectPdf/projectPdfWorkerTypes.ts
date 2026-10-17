import type { ProjectReportData } from "../../services/projectReportDataService";
import type { ProjectPdfTimings } from "./buildProjectFinancialPdf";

export interface ProjectPdfWorkerRequest {
  /** Echoed back so a reused worker's responses can never be matched to the wrong export. */
  id: number;
  data: ProjectReportData;
  timeZone?: string;
}

export type ProjectPdfWorkerResponse =
  | {
      id: number;
      ok: true;
      buffer: ArrayBuffer;
      filename: string;
      pageCount: number;
      invoiceAvailable: boolean;
      textReplaced: boolean;
      timings: ProjectPdfTimings;
    }
  | { id: number; ok: false; message: string };
