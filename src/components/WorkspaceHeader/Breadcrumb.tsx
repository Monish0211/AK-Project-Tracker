import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getBreadcrumbs } from "../../utils/breadcrumbHelpers";

export const Breadcrumb = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Track viewport width for responsive middle-truncation
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  // Force re-render when project view state changes (tab/notes)
  const [, setRefreshTick] = useState(0);

  const forceRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Listen for tab/notes state changes dispatched by ViewProject
    window.addEventListener("pmo-project-view-state-change", forceRefresh);
    return () => window.removeEventListener("pmo-project-view-state-change", forceRefresh);
  }, [forceRefresh]);

  // Clear session state when leaving project view pages
  useEffect(() => {
    const isProjectView = location.pathname.startsWith("/projects/view/");
    if (!isProjectView) {
      sessionStorage.removeItem("view-project-tab");
      sessionStorage.removeItem("view-project-notes");
    }
  }, [location.pathname]);

  const items = getBreadcrumbs(location.pathname);

  const handleClick = (href?: string, clickable?: boolean) => {
    if (clickable && href) {
      navigate(href);
    }
  };

  const showTruncated = isMobile && items.length > 2;

  return (
    <div className="flex items-center text-sm font-semibold transition-opacity duration-150 animate-fade-in-up">
      {showTruncated ? (
        <div className="flex items-center">
          {/* First Item */}
          {(() => {
            const first = items[0];
            const Icon = first.icon;
            return (
              <button
                onClick={() => handleClick(first.href, first.clickable)}
                disabled={!first.clickable || !first.href}
                className="flex items-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-150 border-none bg-transparent p-0 cursor-pointer text-left"
              >
                {Icon && <Icon className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
                <span>{first.label}</span>
              </button>
            );
          })()}

          <span className="text-slate-400 dark:text-slate-500 mx-2 select-none">›</span>
          <span className="text-slate-400 dark:text-slate-500 select-none">...</span>
          <span className="text-slate-400 dark:text-slate-500 mx-2 select-none">›</span>

          {/* Last (Current) Item */}
          {(() => {
            const last = items[items.length - 1];
            const Icon = last.icon;
            return (
              <span className="flex items-center text-slate-800 dark:text-[#FFFFFF] font-bold select-none">
                {Icon && <Icon className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
                <span>{last.label}</span>
              </span>
            );
          })()}
        </div>
      ) : (
        items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const Icon = item.icon;

          return (
            <React.Fragment key={idx}>
              {isLast ? (
                <span className="flex items-center text-slate-800 dark:text-[#FFFFFF] font-bold select-none">
                  {Icon && <Icon className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
                  <span>{item.label}</span>
                </span>
              ) : (
                <button
                  onClick={() => handleClick(item.href, item.clickable)}
                  disabled={!item.clickable || !item.href}
                  className="flex items-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition duration-150 border-none bg-transparent p-0 cursor-pointer text-left"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
                  <span>{item.label}</span>
                </button>
              )}
              {!isLast && (
                <span className="text-slate-400 dark:text-slate-500 mx-2 select-none">›</span>
              )}
            </React.Fragment>
          );
        })
      )}
    </div>
  );
};
export default Breadcrumb;
