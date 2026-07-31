import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body via a React Portal.
 * This escapes any stacking context (z-index traps, overflow, transforms)
 * created by ancestor components like Navbar or MainLayout.
 */
export const Portal = ({ children }: { children: React.ReactNode }) => {
  const el = useRef(document.createElement("div"));

  useEffect(() => {
    const container = el.current;
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  }, []);

  return createPortal(children, el.current);
};

export default Portal;
