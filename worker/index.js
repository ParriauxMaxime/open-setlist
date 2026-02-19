const ALLOWED_HOSTS = ["www.ultimate-guitar.com", "tabs.ultimate-guitar.com"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");

    if (!target) {
      return new Response("Missing ?url= parameter", { status: 400, headers: CORS_HEADERS });
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("Invalid URL", { status: 400, headers: CORS_HEADERS });
    }

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new Response(`Host not allowed: ${parsed.hostname}`, {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const response = new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "text/html",
          ...CORS_HEADERS,
        },
      });

      return response;
    } catch (err) {
      return new Response(`Upstream error: ${err.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
  },
};
