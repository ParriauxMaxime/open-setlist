const CACHE_VERSION = "open-setlist-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(["./", "./index.html"]);
    })
  );
});

self.addEventListener("activate", (event) => {
  // Clean old caches on version bump
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Skip chrome-extension and non-http(s) requests
  if (!request.url.startsWith("http")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Don't cache non-ok responses or opaque responses
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(request, clone);
        });

        return response;
      });
    })
  );
});
