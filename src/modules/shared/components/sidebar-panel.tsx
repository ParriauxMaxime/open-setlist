import { type ReactNode, useEffect } from "react";
import { useFocusTrap } from "../hooks/use-focus-trap";

interface SidebarPanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Slide-in sidebar overlay — shared between admin mobile and performance mode.
 * Handles backdrop, slide animation, and Escape key dismissal.
 */
export function SidebarPanel({ open, onClose, children }: SidebarPanelProps) {
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
          aria-label="Close menu"
          tabIndex={-1}
        />
      )}

      {/* Panel */}
      <nav
        ref={trapRef as React.RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-border bg-bg-surface transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {children}
      </nav>
    </>
  );
}
