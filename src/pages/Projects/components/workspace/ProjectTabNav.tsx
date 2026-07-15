import type { LucideIcon } from "lucide-react";

export interface WorkspaceTabConfig<TKey extends string> {
  key: TKey;
  label: string;
  icon: LucideIcon;
}

interface Props<TKey extends string> {
  tabs: WorkspaceTabConfig<TKey>[];
  activeTab: TKey;
  onChange: (key: TKey) => void;
}

const ProjectTabNav = <TKey extends string>({ tabs, activeTab, onChange }: Props<TKey>) => {
  return (
    <div className="sticky top-0 z-10 bg-[var(--nu-surface)] border-b border-[var(--nu-border)] px-3 py-2 overflow-x-auto nu-scrollbar rounded-t-[var(--nu-radius-lg)]">
      <div className="flex gap-1.5 min-w-max">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--nu-radius-md)] text-[12.5px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[var(--nu-accent)] text-white shadow-[var(--nu-shadow-sm)]"
                  : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
              }`}
            >
              <Icon size={15} strokeWidth={2.25} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectTabNav;
