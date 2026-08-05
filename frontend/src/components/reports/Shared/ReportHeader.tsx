import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Briefcase,
  Receipt,
  Wallet,
  DollarSign,
  PieChart,
  Users,
  UserCheck,
  Layers,
  FileCheck,
  ChevronDown,
} from "lucide-react";

export type ReportTabKey =
  | "executive"
  | "financial"
  | "project-performance"
  | "invoice"
  | "collection"
  | "expense"
  | "profitability"
  | "customer"
  | "resource"
  | "quantity"
  | "commercial";

export type ReportGroupKey = "executive" | "commercial" | "operations" | "business";

export interface ReportItem {
  key: ReportTabKey;
  label: string;
  group: ReportGroupKey;
  icon: any;
}

export const REPORT_ITEMS: ReportItem[] = [
  // Group 1 — Executive
  { key: "executive", label: "Executive Summary", group: "executive", icon: BarChart3 },
  { key: "financial", label: "Financial Performance", group: "executive", icon: TrendingUp },
  { key: "project-performance", label: "Project Performance", group: "executive", icon: Briefcase },

  // Group 2 — Commercial
  { key: "invoice", label: "Invoice Analytics", group: "commercial", icon: Receipt },
  { key: "collection", label: "Collection Analytics", group: "commercial", icon: Wallet },
  { key: "commercial", label: "Commercial Analytics", group: "commercial", icon: FileCheck },

  // Group 3 — Operations
  { key: "expense", label: "Expense Analytics", group: "operations", icon: DollarSign },
  { key: "resource", label: "Resource Analytics", group: "operations", icon: UserCheck },
  { key: "quantity", label: "Quantity Analytics", group: "operations", icon: Layers },

  // Group 4 — Business
  { key: "customer", label: "Customer Analytics", group: "business", icon: Users },
  { key: "profitability", label: "Profitability Analytics", group: "business", icon: PieChart },
];

export const REPORT_GROUPS: { key: ReportGroupKey; label: string }[] = [
  { key: "executive", label: "Executive" },
  { key: "commercial", label: "Commercial" },
  { key: "operations", label: "Operations" },
  { key: "business", label: "Business" },
];

interface Props {
  activeTab: ReportTabKey;
  onTabChange: (tab: ReportTabKey) => void;
  filteredCount: number;
  totalCount: number;
}

export function ReportHeader({ activeTab, onTabChange, filteredCount, totalCount }: Props) {
  const currentItem = REPORT_ITEMS.find((item) => item.key === activeTab) || REPORT_ITEMS[0];
  const [activeGroup, setActiveGroup] = useState<ReportGroupKey>(currentItem.group);

  useEffect(() => {
    const item = REPORT_ITEMS.find((i) => i.key === activeTab);
    if (item) {
      setActiveGroup(item.group);
    }
  }, [activeTab]);

  const groupItems = REPORT_ITEMS.filter((i) => i.group === activeGroup);

  const handleGroupClick = (groupKey: ReportGroupKey) => {
    setActiveGroup(groupKey);
    const firstInGroup = REPORT_ITEMS.find((i) => i.group === groupKey);
    if (firstInGroup) {
      onTabChange(firstInGroup.key);
    }
  };

  return (
    <div className="space-y-3">
      {/* PMO Dashboard Hero Bar (Enhanced Height ~100px & Visual Weight) */}
      <div
        className="relative overflow-hidden rounded-[14px] p-5 sm:px-6 sm:py-4 shadow-lg border border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-white min-h-[96px]"
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%)",
        }}
      >
        {/* Decorative backdrop glow */}
        <div className="absolute -right-8 -bottom-8 w-56 h-56 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-inner shrink-0">
              <BarChart3 size={22} />
            </span>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase">
                PMO REPORT CENTER
              </h1>
              <p className="text-xs text-blue-100/90 font-medium pt-0.5">
                Enterprise analytics suite for financial, project, commercial, expense, resource and customer analytics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center relative z-10 shrink-0">
          <span className="px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold text-white font-mono shadow-xs">
            Showing {filteredCount} / {totalCount} Projects
          </span>
        </div>
      </div>

      {/* Grouped Category Navigation & Sub-Tabs */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-2.5 rounded-xl space-y-2 shadow-xs">
        {/* Top Level Category Groups (Executive, Commercial, Operations, Business) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 nu-scrollbar">
          {REPORT_GROUPS.map((g) => {
            const isGroupActive = activeGroup === g.key;
            const count = REPORT_ITEMS.filter((i) => i.group === g.key).length;

            return (
              <button
                key={g.key}
                type="button"
                onClick={() => handleGroupClick(g.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                  isGroupActive
                    ? "bg-[var(--nu-accent)] text-white shadow-xs"
                    : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] hover:text-[var(--nu-text)] border border-[var(--nu-border)]"
                }`}
              >
                <span>{g.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9.5px] ${
                    isGroupActive ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {count}
                </span>
                <ChevronDown size={12} className={isGroupActive ? "opacity-100" : "opacity-50"} />
              </button>
            );
          })}
        </div>

        {/* Sub-Module Reports Belonging to Active Group */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[var(--nu-border)]/60 nu-scrollbar">
          {groupItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                    : "bg-[var(--nu-surface-alt)]/60 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
                }`}
              >
                <Icon size={13} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
