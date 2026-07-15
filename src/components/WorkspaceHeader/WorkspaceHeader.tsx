import Breadcrumb from "./Breadcrumb";

export const WorkspaceHeader = () => {
  return (
    <div className="flex h-[44px] items-center justify-between px-4 py-2 bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800 rounded-xl transition duration-150">
      
      {/* Left side: Dynamic Breadcrumb Navigation */}
      <div className="flex items-center">
        <Breadcrumb />
      </div>

      {/* Right side: Page Actions Placeholder Slot (Future Ready) */}
      <div className="flex items-center gap-3">
        {/* Actions can be mapped or mounted here in future iterations */}
      </div>

    </div>
  );
};
export default WorkspaceHeader;
