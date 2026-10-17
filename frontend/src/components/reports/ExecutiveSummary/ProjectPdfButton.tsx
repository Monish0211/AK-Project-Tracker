import { useEffect, useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { usePmoToast } from "../../ui/usePmoToast";
import { fetchProjectReportData, ProjectReportDataError } from "../../../services/projectReportDataService";
import { generateProjectPdf } from "../../../reports/projectPdf/generateProjectPdf";

/**
 * One-click Project Financial Report PDF download (Oct 2026). Fetches live
 * data at click time (read-only — see projectReportDataService.ts), then
 * builds the PDF in a Web Worker (generateProjectPdf.ts) so jsPDF, the
 * embedded fonts and the CPU-heavy layout never block the page or enter the
 * main bundle. Independent of the Reports table's own figures and of
 * ReportExportButtons' Excel/CSV export.
 */

type Stage = "idle" | "fetching" | "building";
const STAGE_LABEL: Record<Exclude<Stage, "idle">, string> = { fetching: "Loading data…", building: "Building PDF…" };

// Shared across every button instance: the row icon and the header button
// for the same project can never start two generations at once.
const inFlight = new Set<string>();

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled so the download is not cut off.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  projectId: string | null;
  prNo: string;
  variant: "icon" | "button";
  /** Tooltip shown while disabled (header button without a single-project filter). */
  disabledReason?: string;
}

export function ProjectPdfButton({ projectId, prNo, variant, disabledReason }: Props) {
  const { showToast } = usePmoToast();
  const [stage, setStage] = useState<Stage>("idle");
  const busy = stage !== "idle";
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const disabled = !projectId || busy;

  const handleClick = async () => {
    if (!projectId || inFlight.has(projectId)) return;
    inFlight.add(projectId);
    setStage("fetching");
    try {
      const data = await fetchProjectReportData(projectId);
      if (mounted.current) setStage("building");
      const built = await generateProjectPdf(data);
      saveBlob(built.blob, built.filename);
      showToast({
        type: built.invoiceAvailable ? "success" : "warning",
        message: built.invoiceAvailable
          ? `Downloaded ${built.filename}`
          : `Downloaded ${built.filename} — invoice figures are not included because your account has no invoice access.`,
        id: `project-pdf-${projectId}`,
      });
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof ProjectReportDataError ? err.message : "Couldn't generate the PDF — please try again.",
        id: `project-pdf-error-${projectId}`,
      });
    } finally {
      inFlight.delete(projectId);
      if (mounted.current) setStage("idle");
    }
  };

  const label = `Download financial report PDF for ${prNo || "this project"}`;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={busy ? STAGE_LABEL[stage as Exclude<Stage, "idle">] : label}
        aria-label={label}
        aria-busy={busy}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] hover:text-[var(--nu-accent)] hover:border-[var(--nu-accent)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={!projectId ? disabledReason : busy ? STAGE_LABEL[stage as Exclude<Stage, "idle">] : label}
      aria-label={!projectId ? disabledReason : label}
      aria-busy={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--nu-accent)] hover:opacity-90 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed no-print"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      <span>{busy ? STAGE_LABEL[stage as Exclude<Stage, "idle">] : "Export PDF"}</span>
    </button>
  );
}
