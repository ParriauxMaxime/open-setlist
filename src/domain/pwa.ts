import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export type Platform = "android-chrome" | "ios-safari" | "ios-other" | "desktop" | "standalone";

export function detectPlatform(): Platform {
  // Already installed as PWA
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone
  ) {
    return "standalone";
  }

  const ua = navigator.userAgent;

  if (/iPhone|iPad|iPod/i.test(ua)) {
    // iOS: Safari vs other browsers
    if (/Safari/i.test(ua) && !/CriOS|FxiOS/i.test(ua)) {
      return "ios-safari";
    }
    return "ios-other";
  }

  if (/Android/i.test(ua) && /Chrome/i.test(ua)) {
    return "android-chrome";
  }

  return "desktop";
}

// ---------------------------------------------------------------------------
// Dismiss state
// ---------------------------------------------------------------------------

const DISMISS_KEY = "open-setlist-pwa-dismissed";

export function isDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismiss(): void {
  localStorage.setItem(DISMISS_KEY, "1");
}

// ---------------------------------------------------------------------------
// Reopen prompt from elsewhere (e.g. settings)
// ---------------------------------------------------------------------------

const PWA_PROMPT_EVENT = "open-setlist-show-pwa-prompt";

export function requestPwaPrompt(): void {
  window.dispatchEvent(new CustomEvent(PWA_PROMPT_EVENT));
}

export function onPwaPromptRequest(callback: () => void): () => void {
  window.addEventListener(PWA_PROMPT_EVENT, callback);
  return () => window.removeEventListener(PWA_PROMPT_EVENT, callback);
}

// ---------------------------------------------------------------------------
// beforeinstallprompt hook (Android Chrome only)
// ---------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt(): { prompt: () => Promise<void> } | null {
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      eventRef.current = e as BeforeInstallPromptEvent;
      setReady(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!ready) return null;

  return {
    prompt: async () => {
      const event = eventRef.current;
      if (!event) return;
      await event.prompt();
      eventRef.current = null;
      setReady(false);
    },
  };
}
