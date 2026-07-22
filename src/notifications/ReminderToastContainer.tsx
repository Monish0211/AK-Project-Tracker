import React from "react";
import { createPortal } from "react-dom";
import { useToasts } from "./useToasts";
import { toastStore } from "./toastStore";
import { ReminderToast } from "./ReminderToast";

/**
 * The single global toast container (see GlobalReminderProvider — mounted
 * once, above the page <Routes>, never inside an individual page). Renders
 * every active reminder toast stacked bottom-right, newest closest to the
 * corner. Purely a view over toastStore — dismissing here never touches the
 * reminder or its Notification Bell entry (that's the permanent history,
 * untouched).
 *
 * Rendered via a portal straight to document.body rather than in place in
 * the React tree: `position: fixed` only anchors to the true viewport when
 * no ancestor has a transform/filter/perspective creating its own
 * containing block. MainLayout's root element carries a fill-mode: forwards
 * entrance animation (translateY), which permanently leaves a non-`none`
 * transform on it for the whole session — that would otherwise make this
 * container "fixed" to that div instead of the viewport, and behave
 * inconsistently depending on a given page's content height. The portal
 * makes this container immune to that (and any future ancestor styling)
 * regardless of where GlobalReminderProvider sits in the component tree.
 */
export const ReminderToastContainer: React.FC = () => {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col-reverse gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ReminderToast toast={toast} onDismiss={toastStore.dismiss.bind(toastStore)} />
        </div>
      ))}
    </div>,
    document.body
  );
};
