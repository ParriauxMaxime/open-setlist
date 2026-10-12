import {
  handleBandRequest,
  handleRelayRequest,
  joinChunks,
  LIVE_PROTOCOL,
  MAX_LIVE_MESSAGE_BYTES,
  parseAllowedOrigins,
  refuseLive,
  routeBand,
  splitChunks,
} from "./relay.ts";

const ALLOWED_HOSTS = ["www.ultimate-guitar.com", "tabs.ultimate-guitar.com"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// One Durable Object per band. Tables are created with the band, so probing a
// random band id stores nothing.
function sqlStore(storage) {
  const { sql } = storage;

  const writeBlob = (key, data) => {
    sql.exec("DELETE FROM blobs WHERE key = ?", key);
    splitChunks(data).forEach((chunk, seq) => {
      sql.exec("INSERT INTO blobs (key, seq, data) VALUES (?, ?, ?)", key, seq, chunk.buffer);
    });
  };

  return {
    load() {
      const created = sql.exec("SELECT 1 FROM sqlite_master WHERE name = 'band'").toArray();
      if (created.length === 0) return null;
      const [band] = sql.exec("SELECT auth_hash, version FROM band").toArray();
      return band ? { authHash: band.auth_hash, version: band.version } : null;
    },
    create(authHash, meta) {
      storage.transactionSync(() => {
        sql.exec(
          "CREATE TABLE band (id INTEGER PRIMARY KEY CHECK (id = 1), auth_hash TEXT NOT NULL, version INTEGER NOT NULL)",
        );
        sql.exec(
          "CREATE TABLE blobs (key TEXT NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (key, seq))",
        );
        sql.exec("INSERT INTO band (id, auth_hash, version) VALUES (1, ?, 0)", authHash);
        writeBlob("meta", meta);
      });
    },
    read(key) {
      const rows = sql.exec("SELECT data FROM blobs WHERE key = ? ORDER BY seq", key).toArray();
      return rows.length > 0 ? joinChunks(rows.map((row) => new Uint8Array(row.data))) : null;
    },
    writeSnapshot(data, version) {
      storage.transactionSync(() => {
        writeBlob("snapshot", data);
        sql.exec("UPDATE band SET version = ?", version);
      });
    },
    fileIds() {
      const rows = sql.exec("SELECT key FROM blobs WHERE seq = 0 AND key LIKE 'file:%'").toArray();
      return rows.map((row) => row.key.slice("file:".length));
    },
    writeFile(fileId, data) {
      storage.transactionSync(() => writeBlob(`file:${fileId}`, data));
    },
  };
}

export class Band {
  constructor(ctx) {
    this.ctx = ctx;
    this.store = sqlStore(ctx.storage);
  }

  async fetch(request) {
    if (routeBand(new URL(request.url).pathname)?.resource !== "live") {
      return handleBandRequest(request, this.store);
    }
    const refusal = await refuseLive(request, this.store, this.ctx.getWebSockets().length);
    if (refusal) return refusal;
    const [client, server] = Object.values(new WebSocketPair());
    // Hibernating sockets: the object sleeps between messages
    this.ctx.acceptWebSocket(server);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": LIVE_PROTOCOL },
    });
  }

  // Live channel: every message goes to the other devices, unread
  webSocketMessage(sender, message) {
    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > MAX_LIVE_MESSAGE_BYTES) return;
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === sender) continue;
      try {
        peer.send(message);
      } catch {
        // Peer already gone
      }
    }
  }

  webSocketClose(socket, code) {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // Already closed
    }
  }
}

async function proxy(request) {
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
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/bands")) {
      return handleRelayRequest(request, parseAllowedOrigins(env.ALLOWED_ORIGINS), (bandId, req) =>
        env.BANDS.get(env.BANDS.idFromName(bandId)).fetch(req),
      );
    }
    return proxy(request);
  },
};
