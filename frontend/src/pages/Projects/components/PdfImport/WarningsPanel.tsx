import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { PdfImportUnmappedField, PdfImportWarning } from "../../../../types/PdfImport";

interface Props {
  warnings: PdfImportWarning[];
  unmappedFields: PdfImportUnmappedField[];
}

const SEVERITY_META = {
  error: { icon: AlertCircle, className: "border-[var(--nu-danger)]/30 bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]" },
  warning: { icon: AlertTriangle, className: "border-[var(--nu-warning)]/30 bg-[var(--nu-warning-soft)] text-[var(--nu-warning)]" },
  info: { icon: Info, className: "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]" },
} as const;

/** Shows both the extraction's own warnings and this feature's client-side validator findings (missing required fields, low confidence, milestone % mismatch), plus every field the Rule Engine deliberately never auto-fills (PO Number, always). */
export const WarningsPanel = ({ warnings, unmappedFields }: Props) => {
  if (warnings.length === 0 && unmappedFields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Warnings ({warnings.length})
          </p>
          {warnings.map((warning, index) => {
            const meta = SEVERITY_META[warning.severity];
            const Icon = meta.icon;
            return (
              <div
                key={`${warning.field}-${index}`}
                className={`flex items-start gap-2 rounded-[var(--nu-radius-md)] border px-3.5 py-2.5 text-[12.5px] font-medium ${meta.className}`}
              >
                <Icon size={14} strokeWidth={2.25} className="shrink-0 mt-0.5" />
                <span>{warning.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {unmappedFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Not Auto-Filled — Manual Entry Required
          </p>
          {unmappedFields.map((field, index) => (
            <div
              key={`${field.label}-${index}`}
              className="flex items-start gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3.5 py-2.5 text-[12.5px]"
            >
              <ShieldAlert size={14} strokeWidth={2.25} className="shrink-0 mt-0.5 text-[var(--nu-text-muted)]" />
              <span>
                <span className="font-semibold text-[var(--nu-text)]">{field.label}</span>
                {field.rawValue && (
                  <span className="text-[var(--nu-text-secondary)]"> — found "{field.rawValue}" in the document. </span>
                )}
                <span className="text-[var(--nu-text-muted)]">{field.reason}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WarningsPanel;
