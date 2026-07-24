import type { ReactNode } from "react";

interface EmptyStateRowProps {
  /** Must match the table's column count so the cell spans the full width. */
  colSpan: number;
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
}

/**
 * EmptyState's table-row-safe sibling — EmptyState assumes a block/flex
 * container, which isn't valid inside a <tbody>. Renders a full <tr><td>
 * so it can drop straight into existing table markup. Replaces the ad-hoc
 * "No X Found" <td> patterns duplicated (with drifting copy/colors) across
 * InvoiceTable, EmployeeTable, Manpower.tsx, Reports.tsx, ProjectTable, and
 * QuantityCard.
 */
export const EmptyStateRow = ({ colSpan, icon, title, description }: EmptyStateRowProps) => (
  <tr>
    <td colSpan={colSpan} className="py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        {icon && (
          <div className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[var(--nu-text-muted)] flex items-center justify-center">
            {icon}
          </div>
        )}
        <p className="text-[12.5px] font-semibold text-[var(--nu-text-secondary)]">{title}</p>
        {description && (
          <p className="text-[11.5px] text-[var(--nu-text-muted)] max-w-[280px] leading-snug">{description}</p>
        )}
      </div>
    </td>
  </tr>
);
