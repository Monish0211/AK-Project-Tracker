import { useMemo } from "react";
import type { ProjectNote } from "../../types/ProjectNote";
import { User, Clock, FileText, ExternalLink, AlertCircle, CheckCircle2, Trash2, Edit3 } from "lucide-react";
import { formatNoteTime } from "../../services/ProjectNotesService";
import { getProjectById } from "../../services/projectService";
import { useNavigate } from "react-router-dom";
import { usePmoToast } from "../ui/usePmoToast";

interface Props {
  note: ProjectNote;
}

const INVOICE_NO_REGEX = /(PR-[^\s\n,:]+-INV-\d+)/gi;

export const ProjectNoteCard = ({ note }: Props) => {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();

  // Determine icon & header tint based on note subject / title
  const noteHeaderMeta = useMemo(() => {
    const msg = note.message.toUpperCase();
    if (msg.startsWith("INVOICE DELETED")) {
      return { icon: Trash2, tint: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50", label: "Invoice Deleted" };
    }
    if (msg.startsWith("INVOICE UPDATED") || msg.startsWith("INVOICE STATUS UPDATED")) {
      return { icon: Edit3, tint: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50", label: "Invoice Updated" };
    }
    if (msg.startsWith("INVOICE RAISED") || msg.includes("RAISED")) {
      return { icon: FileText, tint: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50", label: "Invoice Raised" };
    }
    if (msg.startsWith("PROJECT COMPLETED")) {
      return { icon: CheckCircle2, tint: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50", label: "Project Completed" };
    }
    return { icon: User, tint: "text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800", label: note.createdBy };
  }, [note.message, note.createdBy]);

  // Lookup invoice status from current project state
  const invoiceLookup = useMemo(() => {
    const matches = note.message.match(INVOICE_NO_REGEX);
    if (!matches || matches.length === 0) return null;

    const invoiceNo = matches[0];
    const project = getProjectById(note.projectId);
    if (!project) return { invoiceNo, exists: false };

    let foundLineId: string | undefined = undefined;
    const exists = (project.invoiceItems || []).some((item) =>
      (item.invoices || []).some((line) => {
        if (line.invoiceNo.toLowerCase() === invoiceNo.toLowerCase()) {
          foundLineId = line.id;
          return true;
        }
        return false;
      })
    );

    return { invoiceNo, exists, lineId: foundLineId, projectId: project.id };
  }, [note.message, note.projectId]);

  const HeaderIcon = noteHeaderMeta.icon;

  const handleInvoiceClick = (invoiceNo: string, lineId?: string, projectId?: string) => {
    if (invoiceLookup && !invoiceLookup.exists) {
      showToast({ type: "info", message: `This invoice (${invoiceNo}) has been deleted.` });
      return;
    }
    if (projectId) {
      navigate(`/projects/edit/${projectId}`, {
        state: { tab: "invoices", invoiceLineId: lineId },
      });
    }
  };

  return (
    <div className="p-4 bg-transparent hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors duration-150 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
      {/* Header Row: Avatar/Icon, Creator/Type, Time */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${noteHeaderMeta.tint}`}>
            <HeaderIcon size={14} />
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
            {note.createdBy}
          </span>
        </div>

        {/* Time Badge */}
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
          <Clock size={11} />
          <span>{formatNoteTime(note.createdAt)}</span>
        </div>
      </div>

      {/* Message Row */}
      <div className="pl-9 space-y-2">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {note.message}
        </p>

        {/* Linked Invoice Interactive Badge */}
        {invoiceLookup && (
          <div className="pt-1">
            {invoiceLookup.exists ? (
              <button
                type="button"
                onClick={() => handleInvoiceClick(invoiceLookup.invoiceNo, invoiceLookup.lineId, invoiceLookup.projectId)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer"
              >
                <FileText size={12} />
                <span>Open Invoice {invoiceLookup.invoiceNo}</span>
                <ExternalLink size={10} />
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-[11px] font-bold cursor-help"
                title="This invoice has been deleted from Invoice History."
              >
                <AlertCircle size={12} />
                <span>Invoice {invoiceLookup.invoiceNo} (Deleted)</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectNoteCard;