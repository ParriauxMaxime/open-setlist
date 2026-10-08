import { useCallback, useEffect, useState } from "react";

/** Fullscreen toggle for the whole document. `supported` is false on iPhone Safari. */
export function useFullscreen() {
  const supported = typeof document !== "undefined" && document.fullscreenEnabled === true;
  const [isFullscreen, setIsFullscreen] = useState(
    () => supported && document.fullscreenElement !== null,
  );

  useEffect(() => {
    if (!supported) return;
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [supported]);

  // Leave fullscreen when performance mode unmounts
  useEffect(() => {
    if (!supported) return;
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    request.catch(() => {});
  }, [supported]);

  return { supported, isFullscreen, toggle };
}
