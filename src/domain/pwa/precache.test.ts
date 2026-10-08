import {
  cacheNameFor,
  FetchStrategy,
  isStaleCache,
  routeRequest,
  selectPrecacheAssets,
} from "./precache";

const SCOPE = "https://band.github.io/open-setlist/";

function req(url: string, init: { method?: string; mode?: string } = {}) {
  return { url, method: init.method ?? "GET", mode: init.mode ?? "cors" };
}

describe("routeRequest", () => {
  it("serves same-origin assets under the scope cache-first", () => {
    expect(routeRequest(req(`${SCOPE}assets/main.abc12345.js`), SCOPE)).toBe(
      FetchStrategy.CacheFirst,
    );
    expect(routeRequest(req(`${SCOPE}icons/icon-192.png`, { mode: "no-cors" }), SCOPE)).toBe(
      FetchStrategy.CacheFirst,
    );
  });

  it("treats in-scope navigations (any SPA route) as navigation", () => {
    expect(routeRequest(req(SCOPE, { mode: "navigate" }), SCOPE)).toBe(FetchStrategy.Navigation);
    expect(routeRequest(req(`${SCOPE}setlists/abc/perform`, { mode: "navigate" }), SCOPE)).toBe(
      FetchStrategy.Navigation,
    );
  });

  it.each([
    "https://api.github.com/repos/band/data/contents/snapshot.json",
    "https://www.googleapis.com/drive/v3/files/123?alt=media",
    "https://itunes.apple.com/search?term=foo",
    "https://open-setlist-proxy.example.workers.dev/?url=x",
    "chrome-extension://abc/script.js",
  ])("passes cross-origin requests through: %s", (url) => {
    expect(routeRequest(req(url), SCOPE)).toBe(FetchStrategy.Passthrough);
  });

  it("passes through same-origin requests outside the scope", () => {
    expect(routeRequest(req("https://band.github.io/other-repo/app.js"), SCOPE)).toBe(
      FetchStrategy.Passthrough,
    );
    expect(
      routeRequest(req("https://band.github.io/other-repo/", { mode: "navigate" }), SCOPE),
    ).toBe(FetchStrategy.Passthrough);
  });

  it("passes through non-GET requests, even same-origin", () => {
    for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
      expect(routeRequest(req(`${SCOPE}assets/main.js`, { method }), SCOPE)).toBe(
        FetchStrategy.Passthrough,
      );
    }
  });

  it("works with a root scope (no base path)", () => {
    const root = "http://localhost:3000/";
    expect(routeRequest(req("http://localhost:3000/assets/main.js"), root)).toBe(
      FetchStrategy.CacheFirst,
    );
    expect(routeRequest(req("http://localhost:4000/assets/main.js"), root)).toBe(
      FetchStrategy.Passthrough,
    );
  });

  it("passes through unparseable URLs", () => {
    expect(routeRequest(req("not a url"), SCOPE)).toBe(FetchStrategy.Passthrough);
  });
});

describe("selectPrecacheAssets", () => {
  it("keeps build output, drops source maps, licenses and the SW itself, sorted", () => {
    expect(
      selectPrecacheAssets([
        "sw.js",
        "sw.js.map",
        "index.html",
        "assets/main.abc.js",
        "assets/main.abc.js.map",
        "assets/main.abc.js.LICENSE.txt",
        "assets/main.def.css",
        "manifest.json",
        "icons/icon-192.png",
      ]),
    ).toEqual([
      "assets/main.abc.js",
      "assets/main.def.css",
      "icons/icon-192.png",
      "index.html",
      "manifest.json",
    ]);
  });
});

describe("cache names", () => {
  it("derives a prefixed cache name from the build version", () => {
    expect(cacheNameFor("99b817f42806")).toBe("open-setlist-99b817f42806");
  });

  it("flags only our older caches as stale", () => {
    const current = cacheNameFor("new");
    expect(isStaleCache("open-setlist-v2", current)).toBe(true);
    expect(isStaleCache(cacheNameFor("old"), current)).toBe(true);
    expect(isStaleCache(current, current)).toBe(false);
    expect(isStaleCache("some-other-app", current)).toBe(false);
  });
});
