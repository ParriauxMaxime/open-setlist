import { pushUnsafe } from "@swan-io/chicane";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";

/** The in-app URL a plain left click on a link would open, if any. */
function internalHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return null;
  const href = url.pathname + url.search + url.hash;
  return href === window.location.pathname + window.location.search ? null : href;
}

/**
 * While `dirty`, closing the tab warns and an in-app link asks before leaving.
 * Cmd/Ctrl+S calls `onSave` when dirty. Returns the confirm modal to render.
 */
export function useUnsavedGuard(dirty: boolean, onSave: () => void): ReactNode {
  const { t } = useTranslation();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(onSave);

  useEffect(() => {
    dirtyRef.current = dirty;
    saveRef.current = onSave;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (dirtyRef.current) saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Capture phase on the document runs before the router's own link handler
    const onClick = (e: MouseEvent) => {
      const href = internalHref(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  if (!pendingHref) return null;
  return (
    <ConfirmModal
      title={t("common.unsaved.title")}
      message={t("common.unsaved.message")}
      confirmLabel={t("common.unsaved.leave")}
      cancelLabel={t("common.unsaved.stay")}
      variant="danger"
      onConfirm={() => {
        setPendingHref(null);
        pushUnsafe(pendingHref);
      }}
      onCancel={() => setPendingHref(null)}
    />
  );
}
