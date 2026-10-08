// Pure service-worker logic, shared by the build (rspack.config.ts) and the SW (src/sw.ts).

export const CACHE_PREFIX = "open-setlist-";

export const SW_FILENAME = "sw.js";

/** Navigations wait this long for the network before falling back to the cached app shell. */
export const NAVIGATION_TIMEOUT_MS = 3000;

/** Injected into sw.js at build time as `self.__PRECACHE_MANIFEST__`. */
export interface PrecacheManifest {
  version: string;
  /** Paths relative to the SW scope (the app base path). */
  urls: string[];
}

export function cacheNameFor(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Our caches from previous builds (or the old static `open-setlist-v2`). Foreign caches are left alone. */
export function isStaleCache(name: string, currentName: string): boolean {
  return name.startsWith(CACHE_PREFIX) && name !== currentName;
}

/** Build output files the SW must cache at install. Source maps and the SW itself are excluded. */
export function selectPrecacheAssets(assetNames: string[]): string[] {
  return assetNames
    .filter(
      (name) => name !== SW_FILENAME && !name.endsWith(".map") && !name.endsWith(".LICENSE.txt"),
    )
    .sort();
}

export const FetchStrategy = {
  /** Not ours (cross-origin, outside scope, non-GET): let the browser hit the network untouched. */
  Passthrough: "passthrough",
  /** SPA navigation: network-first with timeout, fallback to cached index.html. */
  Navigation: "navigation",
  /** Same-origin build asset: cache-first from the precache, network on miss (not stored). */
  CacheFirst: "cache-first",
} as const;
export type FetchStrategy = (typeof FetchStrategy)[keyof typeof FetchStrategy];

export interface RequestInfoLike {
  url: string;
  method: string;
  mode: string;
}

export function routeRequest(request: RequestInfoLike, scope: string): FetchStrategy {
  if (request.method !== "GET") return FetchStrategy.Passthrough;

  let url: URL;
  let scopeUrl: URL;
  try {
    url = new URL(request.url);
    scopeUrl = new URL(scope);
  } catch {
    return FetchStrategy.Passthrough;
  }

  if (url.origin !== scopeUrl.origin) return FetchStrategy.Passthrough;
  if (!url.pathname.startsWith(scopeUrl.pathname)) return FetchStrategy.Passthrough;

  if (request.mode === "navigate") return FetchStrategy.Navigation;
  return FetchStrategy.CacheFirst;
}
