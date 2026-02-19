import { proxyFetch } from "./proxy";
import { convertUGToChordPro } from "./ug-converter";

const UG_SEARCH = "https://www.ultimate-guitar.com/search.php";

/**
 * Search Ultimate Guitar for chords and return ChordPro content.
 * Uses the CORS proxy. Returns null on any failure (timeout, parse error, no results).
 */
export async function fetchUGChords(title: string, artist: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    // Step 1: Search UG for chord tabs
    const searchUrl = `${UG_SEARCH}?search_type=title&value=${encodeURIComponent(`${artist} ${title}`)}`;
    const searchRes = await proxyFetch(searchUrl, { signal: controller.signal });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const tabUrl = extractBestTabUrl(searchHtml);
    if (!tabUrl) return null;

    // Step 2: Fetch the actual tab page
    const tabRes = await proxyFetch(tabUrl, { signal: controller.signal });
    if (!tabRes.ok) return null;

    const tabHtml = await tabRes.text();
    const rawContent = extractTabContent(tabHtml);
    if (!rawContent) return null;

    return convertUGToChordPro(rawContent);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Decode HTML entities in a js-store data-content attribute.
 */
function decodeHtmlEntities(encoded: string): string {
  return encoded
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Try to parse the js-store JSON blob from UG HTML.
 * Tries multiple patterns since UG changes their markup.
 */
function extractStoreData(html: string): unknown | null {
  // Pattern 1: data-content attribute on js-store div
  const storeMatch = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (storeMatch) {
    try {
      return JSON.parse(decodeHtmlEntities(storeMatch[1]));
    } catch {
      // Fall through
    }
  }

  // Pattern 2: __NEXT_DATA__ script tag
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (nextMatch) {
    try {
      return JSON.parse(nextMatch[1]);
    } catch {
      // Fall through
    }
  }

  // Pattern 3: window.__DATA__ or similar inline JSON
  const windowMatch = html.match(/window\.__(?:DATA|STORE)__\s*=\s*({.*?});?\s*<\/script>/s);
  if (windowMatch) {
    try {
      return JSON.parse(windowMatch[1]);
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Extract the best "Chords" tab URL from UG search results page.
 */
function extractBestTabUrl(html: string): string | null {
  const data = extractStoreData(html);
  if (!data || typeof data !== "object") return null;

  const paths = [
    ["store", "page", "data", "results"],
    ["store", "page", "data", "data"],
    ["props", "pageProps", "data", "results"],
    ["props", "pageProps", "data", "data"],
  ];

  for (const path of paths) {
    const results = walkPath(data, path);
    if (Array.isArray(results)) {
      const chords = results.find(
        (item: Record<string, unknown>) => item.type === "Chords" && item.tab_url,
      );
      if (chords) return chords.tab_url as string;
    }
  }

  // Fallback: regex for tab URLs in the raw HTML
  const urlMatch = html.match(/https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^\s"']+chords/);
  if (urlMatch) return urlMatch[0];

  return null;
}

/**
 * Extract raw tab content from a UG tab page.
 */
function extractTabContent(html: string): string | null {
  const data = extractStoreData(html);
  if (!data || typeof data !== "object") return null;

  const paths = [
    ["store", "page", "data", "tab_view", "wiki_tab", "content"],
    ["store", "page", "data", "tab", "content"],
    ["props", "pageProps", "tab", "content"],
    ["props", "pageProps", "data", "tab", "content"],
    ["props", "pageProps", "data", "tab_view", "wiki_tab", "content"],
  ];

  for (const path of paths) {
    const content = walkPath(data, path);
    if (typeof content === "string" && content.length > 0) {
      return content;
    }
  }

  return null;
}

/**
 * Safely walk an object path, returning undefined if any step fails.
 */
function walkPath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
