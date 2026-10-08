// Service worker. Built as its own entry (production only) and emitted as `sw.js` at the
// app root; the build prepends `self.__PRECACHE_MANIFEST__` (see rspack.config.ts).
//
// Invariant: index.html and the assets it references always come from the same versioned
// cache, written atomically at install. Navigations are never written to the cache, so an
// old index can't be mixed with new assets (or the reverse) when offline.

import {
  cacheNameFor,
  FetchStrategy,
  isStaleCache,
  NAVIGATION_TIMEOUT_MS,
  type PrecacheManifest,
  routeRequest,
} from "@domain/pwa/precache";

// The DOM lib has no service worker types, and adding the WebWorker lib conflicts with it.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface ServiceWorkerScope {
  __PRECACHE_MANIFEST__: PrecacheManifest;
  registration: ServiceWorkerRegistration;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
}

const sw = self as unknown as ServiceWorkerScope;
const manifest = sw.__PRECACHE_MANIFEST__;
const CACHE_NAME = cacheNameFor(manifest.version);
const scope = sw.registration.scope;
const indexUrl = new URL("index.html", scope).href;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // `reload` bypasses the HTTP cache so index.html and assets come from the same deploy.
        cache.addAll(
          manifest.urls.map((url) => new Request(new URL(url, scope), { cache: "reload" })),
        ),
      )
      // The app is a single JS chunk, so an open page never fetches old assets after the swap.
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => isStaleCache(key, CACHE_NAME)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = routeRequest(request, scope);

  if (strategy === FetchStrategy.Navigation) {
    event.respondWith(handleNavigation(request));
  } else if (strategy === FetchStrategy.CacheFirst) {
    event.respondWith(handleAsset(request));
  }
  // Passthrough: no respondWith, the browser handles the request normally.
});

async function handleAsset(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request)) ?? fetch(request);
}

async function handleNavigation(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(indexUrl);
  const network = fetch(request);

  if (!cached) return network;

  // Slow or captive venue wifi must not hang the app: serve the cached shell after the timeout.
  const timeout = new Promise<Response>((resolve) =>
    setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS),
  );
  return Promise.race([network.catch(() => cached), timeout]);
}
