import { isSentinelState, sentinelState } from "@domain/history-sentinel";
import { pushUnsafe, replaceUnsafe } from "@swan-io/chicane";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";

type PendingLeave = { href: string } | { back: true };

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

// Same URL as the current entry, so the router sees no location change
function pushSentinel() {
  window.history.pushState(sentinelState(), "", window.location.href);
}

/** Opens `href` from a guarded page, taking the sentinel's place to keep one entry for the page. */
export function navigateFromGuardedPage(href: string) {
  if (isSentinelState(window.history.state)) replaceUnsafe(href);
  else pushUnsafe(href);
}

/**
 * While `dirty`, closing the tab warns, and an in-app link or the browser Back button
 * asks before leaving. Cmd/Ctrl+S calls `onSave` when dirty. Returns the confirm modal to render.
 */
export function useUnsavedGuard(dirty: boolean, onSave: () => void): ReactNode {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirtyRef = useRef(dirty);
  const saveRef = useRef(onSave);
  // Sentinel pops we caused ourselves, which must not ask
  const unwindingRef = useRef(0);
  const leavingRef = useRef(false);

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
    const onPopState = (e: PopStateEvent) => {
      if (unwindingRef.current > 0) {
        unwindingRef.current -= 1;
        if (dirtyRef.current) pushSentinel();
        return;
      }
      if (leavingRef.current || !dirtyRef.current || isSentinelState(e.state)) return;
      setPending({ back: true });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    if (unwindingRef.current === 0 && !isSentinelState(window.history.state)) pushSentinel();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leavingRef.current) e.preventDefault();
    };
    // Capture phase on the document runs before the router's own link handler
    const onClick = (e: MouseEvent) => {
      const href = internalHref(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ href });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      if (isSentinelState(window.history.state)) {
        unwindingRef.current += 1;
        window.history.back();
      }
    };
  }, [dirty]);

  const leave = (target: PendingLeave) => {
    setPending(null);
    if ("href" in target) {
      navigateFromGuardedPage(target.href);
      return;
    }
    leavingRef.current = true;
    window.history.back();
  };

  const stay = (target: PendingLeave) => {
    setPending(null);
    if ("back" in target) pushSentinel();
  };

  if (!pending) return null;
  return (
    <ConfirmModal
      title={t("common.unsaved.title")}
      message={t("common.unsaved.message")}
      confirmLabel={t("common.unsaved.leave")}
      cancelLabel={t("common.unsaved.stay")}
      variant="danger"
      onConfirm={() => leave(pending)}
      onCancel={() => stay(pending)}
    />
  );
}
