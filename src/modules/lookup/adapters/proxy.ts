/**
 * URL of the Cloudflare Worker CORS proxy.
 * Deploy with: cd worker/ && wrangler deploy
 * Then paste the URL here.
 */
const PROXY_URL = "https://open-setlist-proxy.maxime-parriaux-25.workers.dev";

/**
 * Fetch a URL through the CORS proxy.
 */
export async function proxyFetch(
  url: string,
  options?: { signal?: AbortSignal },
): Promise<Response> {
  const proxyUrl = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
  return fetch(proxyUrl, { signal: options?.signal });
}
