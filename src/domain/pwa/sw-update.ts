// The page's side of an app update: a new service worker installed and waiting, shown to the
// musician, and swapped in with a reload only when they ask for it.

import { SKIP_WAITING_MESSAGE } from "./precache";

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker;
  for (const listener of listeners) listener();
}

export function subscribeAppUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAppUpdateReady(): boolean {
  return waiting !== null;
}

/** Follows the registration for updates; the very first install has nothing to replace. */
export function watchAppUpdates(registration: ServiceWorkerRegistration): void {
  const offer = (worker: ServiceWorker | null) => {
    if (worker && navigator.serviceWorker.controller) setWaiting(worker);
  };
  offer(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") offer(installing);
    });
  });
  // A PWA left open for days only looks for a new version when it comes back to the front
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registration.update().catch(() => {});
  });
}

/** Activates the waiting version and reloads this tab once it controls the page. */
export function applyAppUpdate(): void {
  if (!waiting) return;
  // Another tab already swapped it in
  if (waiting.state === "activated") {
    window.location.reload();
    return;
  }
  // Only the tab that asked reloads: another one may be on stage
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage(SKIP_WAITING_MESSAGE);
}
