import { useEffect } from "react";

/**
 * Keep the screen on while mounted. The browser drops the lock whenever the
 * page is hidden, so it is re-acquired when the page becomes visible again.
 * Silently does nothing where the Screen Wake Lock API is unsupported or denied.
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          void next.release();
          return;
        }
        sentinel = next;
      } catch {
        // Denied (e.g. battery saver) — nothing useful to do
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}
