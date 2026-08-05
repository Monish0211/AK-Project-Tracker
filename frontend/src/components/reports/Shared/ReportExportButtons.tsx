import { Download, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";

interface Props {
  data: Record<string, any>[];
  filename?: string;
  title?: string;
}

export function ReportExportButtons({ data, filename = "PMO_Report_Export" }: Props) {
  const exportToExcel = () => {
    if (!data || data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report Data");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportToCSV = () => {
    if (!data || data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    window.print();
  };

  return (
    <div className="flex items-center gap-1.5 no-print">
      <button
        type="button"
        onClick={exportToExcel}
        disabled={!data || data.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40"
        title="Export dataset to Excel (.xlsx)"
      >
        <FileSpreadsheet size={14} />
        <span>Export Excel</span>
      </button>

      <button
        type="button"
        onClick={exportToCSV}
        disabled={!data || data.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text)] hover:bg-[var(--nu-surface)] text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-40"
        title="Export dataset to CSV"
      >
        <Download size={14} />
        <span>Export CSV</span>
      </button>

      <button
        type="button"
        onClick={exportToPDF}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--nu-accent)] hover:opacity-90 text-white text-xs font-bold shadow-xs transition cursor-pointer"
        title="Print or Save Report as PDF"
      >
        <Printer size={14} />
        <span>Export PDF</span>
      </button>
    </div>
  );
}
