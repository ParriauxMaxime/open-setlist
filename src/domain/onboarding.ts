import { useSyncExternalStore } from "react";

const DISMISS_KEY = "open-setlist-onboarding-dismissed";

export function isOnboardingDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === "1";
}

export function dismissOnboarding(): void {
  localStorage.setItem(DISMISS_KEY, "1");
  notifyListeners();
}

// --- React hook with useSyncExternalStore ---

let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): string {
  return localStorage.getItem(DISMISS_KEY) ?? "";
}

export function useOnboardingDismissed(): boolean {
  const raw = useSyncExternalStore(subscribe, getSnapshot);
  return raw === "1";
}
