import { prCategoryLabel } from "../../../utils/prCategoryLabel";
import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Portal } from "../../../components/ui/Portal";
import { countryStatusLabel, previewBlocksImport, rowBlocks } from "../../../services/projectCountryImportService";
import type { ImportPreview, ImportRejection } from "../../../services/projectCountryImportService";

/** Rows drawn at once. A very large file is summarised; every blocking row is listed first, so the cap never hides a problem. */
export const IMPORT_PREVIEW_MAX_ROWS = 200;

interface Props {
  open: boolean;
  /** The server's per-row check, shown before anything is created. */
  preview?: ImportPreview | null;
  /** The per-row report of an import the server rejected as a whole. Takes the place of the preview. */
  rejection?: ImportRejection | null;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const th = "text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-secondary)] px-2.5 py-2";
const td = "px-2.5 py-2 text-[12.5px] text-[var(--nu-text)] align-top";

/**
 * Import Projects: shows, per row, the Excel row number, PR Number, PR Category, the country that category belongs to, whether the
 * importing user may import that country, and duplicate status — BEFORE anything is created. Importing is all-or-nothing: if any row has
 * a problem the file is not imported at all and the user fixes the file (or asks for access). Pure display: every decision comes from the
 * backend response.
 */
export function ProjectImportPreviewPanel({ preview, rejection, busy = false, onConfirm, onClose }: Omit<Props, "open">) {
  if (!preview && !rejection) return null;

  const blocked = rejection ? true : preview ? previewBlocksImport(preview) : true;
  const rows = preview
    ? [...preview.rows].sort((a, b) => Number(rowBlocks(b, preview.enforced)) - Number(rowBlocks(a, preview.enforced)) || a.rowNumber - b.rowNumber)
    : [];
  const shown = rows.slice(0, IMPORT_PREVIEW_MAX_ROWS);
  const problemCount = preview ? preview.rows.filter((r) => rowBlocks(r, preview.enforced)).length : (rejection?.total ?? 0);

  return (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import projects preview"
          className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--nu-border)] shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${blocked ? "bg-red-50 text-[var(--nu-danger)]" : "bg-emerald-50 text-emerald-600"}`}>
                {blocked ? <AlertTriangle size={18} /> : <FileSpreadsheet size={18} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">{rejection ? "Import rejected: no projects were created" : blocked ? "This file cannot be imported yet" : "Review the import"}</h2>
                <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
                  {rejection
                    ? rejection.message
                    : blocked
                      ? `${problemCount} row(s) need attention. The import is all or nothing, so fix the file (or ask an Administrator for access to the country) and upload it again.`
                      : `${preview?.summary.total ?? 0} project(s) will be created, each in the country of its own PR Category.`}
                </p>
              </div>
            </div>
            <button aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--nu-surface-alt)] shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto min-h-0 space-y-3">
            {preview && (
              <>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  <span className="px-2.5 py-1 rounded-full border border-[var(--nu-border)]">Rows: {preview.summary.total}</span>
                  {preview.summary.byCountry.map((c) => (
                    <span key={c.country} className="px-2.5 py-1 rounded-full border border-[var(--nu-border)]">
                      {c.country}: {c.rows}
                    </span>
                  ))}
                  {preview.summary.notAuthorized > 0 && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">Not authorized: {preview.summary.notAuthorized}</span>}
                  {preview.summary.blankCategory + preview.summary.unknownCategory + preview.summary.noCountry > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">PR Category problems: {preview.summary.blankCategory + preview.summary.unknownCategory + preview.summary.noCountry}</span>
                  )}
                  {preview.summary.duplicateInFile + preview.summary.duplicateExisting > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">Duplicate PR Numbers: {preview.summary.duplicateInFile + preview.summary.duplicateExisting}</span>
                  )}
                </div>
                {!preview.enforced && preview.summary.notAuthorized > 0 && (
                  <p className="text-[12px] text-amber-800 bg-amber-50 rounded-lg p-2.5">
                    Country access is not enforced on this server yet, so rows marked not authorized are not blocked today. They will be once enforcement is switched on.
                  </p>
                )}
              </>
            )}

            <div className="overflow-x-auto border border-[var(--nu-border)] rounded-[var(--nu-radius-md)]">
              <table className="w-full min-w-[760px]">
                <thead className="bg-[var(--nu-surface-alt)]">
                  <tr>
                    <th className={th}>Row</th>
                    <th className={th}>PR Number</th>
                    <th className={th}>PR Category</th>
                    <th className={th}>Country</th>
                    <th className={th}>Authorization</th>
                    {preview && <th className={th}>Duplicate</th>}
                    <th className={th}>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview
                    ? shown.map((row) => {
                        const bad = rowBlocks(row, preview.enforced);
                        return (
                          <tr key={row.index} className={`border-t border-[var(--nu-border)] ${bad ? "bg-red-50/40" : ""}`}>
                            <td className={td}>{row.rowNumber}</td>
                            <td className={td}>{row.prNo || "(blank)"}</td>
                            <td className={td}>{prCategoryLabel(row.prCategory) || "(blank)"}</td>
                            <td className={td}>{prCategoryLabel(row.country?.displayName) ?? "(not identified)"}</td>
                            <td className={td}>{countryStatusLabel(row.countryStatus, preview.enforced)}</td>
                            <td className={td}>{row.duplicate === "none" ? "No" : row.duplicate === "in_file" ? "Repeated in file" : "Already exists"}</td>
                            <td className={td}>{row.errors.length ? row.errors.join(" ") : "None"}</td>
                          </tr>
                        );
                      })
                    : (rejection?.rows ?? []).map((row, i) => (
                        <tr key={`${row.rowNumber}-${i}`} className="border-t border-[var(--nu-border)] bg-red-50/40">
                          <td className={td}>{row.rowNumber}</td>
                          <td className={td}>{row.prNo || "(blank)"}</td>
                          <td className={td}>{prCategoryLabel(row.prCategory) || "(blank)"}</td>
                          <td className={td}>{prCategoryLabel(row.country) ?? "(not identified)"}</td>
                          <td className={td}>{countryStatusLabel(row.status, true)}</td>
                          <td className={td}>{row.errors.join(" ")}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {preview && rows.length > shown.length && (
              <p className="text-[12px] text-[var(--nu-text-secondary)]">
                Showing the first {shown.length} of {rows.length} rows (rows needing attention are listed first).
              </p>
            )}
            {rejection && (rejection.truncated || rejection.total > rejection.rows.length) && (
              <p className="text-[12px] text-[var(--nu-text-secondary)]">
                Showing {rejection.rows.length} of {rejection.total} rejected rows. Fix these and upload again to see the rest.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-[var(--nu-border)] shrink-0">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              {blocked ? "Close" : "Cancel"}
            </Button>
            {!blocked && (
              <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy} icon={<CheckCircle2 size={14} />}>
                {busy ? "Importing…" : `Import ${preview?.summary.total ?? 0} project(s)`}
              </Button>
            )}
          </div>
        </div>
  );
}

/** The dialog shell: portal-mounted overlay, Escape and click-outside to close. */
export default function ProjectImportPreviewModal({ open, preview, rejection, busy = false, onConfirm, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || (!preview && !rejection)) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <ProjectImportPreviewPanel preview={preview} rejection={rejection} busy={busy} onConfirm={onConfirm} onClose={onClose} />
      </div>
    </Portal>
  );
}
