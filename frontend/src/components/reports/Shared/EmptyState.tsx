import { SearchX } from "lucide-react";

interface Props {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No Data Found",
  description = "No matching records found for the selected filter parameters.",
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-2xl space-y-2 my-4">
      <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-[var(--nu-text-muted)]">
        <SearchX size={24} />
      </div>
      <h4 className="text-sm font-extrabold text-[var(--nu-text)]">{title}</h4>
      <p className="text-xs text-[var(--nu-text-muted)] max-w-sm">{description}</p>
    </div>
  );
}
