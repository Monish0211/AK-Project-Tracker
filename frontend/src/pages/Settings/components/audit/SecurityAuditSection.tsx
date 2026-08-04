import { useState, useMemo } from "react";
import { Download, RefreshCw, Shield, CheckCircle2 } from "lucide-react";
import { auditLogService } from "../../../../services/auditLogService";
import type { AuditLogItem, AuditFilterOptions } from "../../../../types/AuditLog";
import { AuditSummaryCards } from "./AuditSummaryCards";
import { AuditFilterBar } from "./AuditFilterBar";
import { AuditLogTable } from "./AuditLogTable";
import { AuditDetailDrawer } from "./AuditDetailDrawer";
import { RecentSecurityEventsCard } from "./RecentSecurityEventsCard";
import { FailedLoginCard } from "./FailedLoginCard";
import { SystemTimelineCard } from "./SystemTimelineCard";

export function SecurityAuditSection() {
  const [logs, setLogs] = useState<AuditLogItem[]>(() => auditLogService.getAuditLogs());
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters State
  const [filters, setFilters] = useState<AuditFilterOptions>({
    searchQuery: "",
    eventType: "all",
    userEmail: "all",
    module: "all",
    dateRange: "all",
    status: "all",
  });

  // Calculate filtered logs
  const filteredLogs = useMemo(() => {
    return auditLogService.filterLogs(logs, filters);
  }, [logs, filters]);

  // Calculate KPI stats
  const kpiStats = useMemo(() => {
    return auditLogService.calculateKPIStats(logs);
  }, [logs]);

  // Unique users & event types for filter dropdowns
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    logs.forEach((l) => {
      if (!map.has(l.companyEmail)) {
        map.set(l.companyEmail, { name: l.employeeName, email: l.companyEmail });
      }
    });
    return Array.from(map.values());
  }, [logs]);

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  // Handlers
  const handleResetFilters = () => {
    setFilters({
      searchQuery: "",
      eventType: "all",
      userEmail: "all",
      module: "all",
      dateRange: "all",
      status: "all",
    });
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setToastMessage("Refreshing audit logs from system log register...");
    setTimeout(() => {
      setLogs(auditLogService.getAuditLogs());
      setIsRefreshing(false);
      setTimeout(() => setToastMessage(null), 3000);
    }, 600);
  };

  const handleExport = () => {
    auditLogService.exportToCSV(filteredLogs);
    setToastMessage(`Exported ${filteredLogs.length} audit log records to CSV file.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-5 nu-fade-in pb-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ════════ PAGE HEADER & ACTIONS ════════ */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-5 shadow-[var(--nu-shadow-sm)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-extrabold text-[var(--nu-text)] tracking-tight">
                Security & Audit Logs
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10.5px] font-bold uppercase tracking-wider">
                Enterprise Audit Trail
              </span>
            </div>
            <p className="text-xs text-[var(--nu-text-muted)] mt-0.5">
              Monitor user activities, authentication history, project modifications and system audit events.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--nu-accent)] hover:opacity-90 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Download size={14} />
            <span>Export Logs</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text)] text-xs font-bold hover:bg-[var(--nu-surface-alt)] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ════════ 5 SUMMARY KPI CARDS ════════ */}
      <AuditSummaryCards stats={kpiStats} />

      {/* ════════ FILTER BAR ════════ */}
      <AuditFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        uniqueUsers={uniqueUsers}
        eventTypes={eventTypes}
      />

      {/* ════════ MAIN CONTENT GRID ════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Columns: Audit Log Table */}
        <div className="lg:col-span-2 space-y-5">
          <AuditLogTable logs={filteredLogs} onSelectLog={setSelectedLog} />
          <FailedLoginCard records={auditLogService.getFailedLogins()} />
        </div>

        {/* Right 1 Column: Security Cards & System Activity Timeline */}
        <div className="space-y-5">
          <RecentSecurityEventsCard logs={logs} onSelectLog={setSelectedLog} />
          <SystemTimelineCard activities={auditLogService.getSystemTimeline()} />
        </div>
      </div>

      {/* ════════ AUDIT DETAIL DRAWER ════════ */}
      <AuditDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
