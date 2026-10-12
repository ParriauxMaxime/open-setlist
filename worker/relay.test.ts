import {
  CHUNK_BYTES,
  isAllowedOrigin,
  LIVE_PROTOCOL,
  MAX_LIVE_PEERS,
  MAX_META_BYTES,
  MAX_SNAPSHOT_BYTES,
  parseAllowedOrigins,
  refuseLive,
  routeBand,
  VERSION_HEADER,
} from "./relay";
import { MemoryRelay } from "./test-fakes";

const BAND = "0123456789abcdef0123456789abcdef";
const TOKEN = "band-token";

function bytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function call(
  relay: MemoryRelay,
  method: string,
  path: string,
  options: { token?: string | null; version?: number; body?: BodyInit; origin?: string } = {},
): Promise<Response> {
  const headers = new Headers();
  const token = options.token === undefined ? TOKEN : options.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.version !== undefined) headers.set(VERSION_HEADER, String(options.version));
  if (options.origin) headers.set("Origin", options.origin);
  return relay.fetch(`${relay.url}${path}`, { method, headers, body: options.body });
}

async function createBand(relay: MemoryRelay): Promise<void> {
  const res = await call(relay, "POST", `/bands/${BAND}`, { body: bytes("meta") });
  expect(res.status).toBe(201);
}

function putSnapshot(relay: MemoryRelay, version: number, content: string): Promise<Response> {
  return call(relay, "PUT", `/bands/${BAND}/snapshot`, { version, body: bytes(content) });
}

async function snapshotText(relay: MemoryRelay): Promise<string> {
  const res = await call(relay, "GET", `/bands/${BAND}/snapshot`);
  return res.text();
}

describe("routes", () => {
  it("only knows a band, its snapshot and its files", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    expect(routeBand(`/bands/${BAND}`)).toEqual({ bandId: BAND, resource: "band" });
    expect(routeBand(`/bands/${BAND}/snapshot`)).toEqual({ bandId: BAND, resource: "snapshot" });
    expect(routeBand(`/bands/${BAND}/files`)).toEqual({ bandId: BAND, resource: "files" });
    expect(routeBand(`/bands/${BAND}/files/${fileId}`)).toEqual({
      bandId: BAND,
      resource: "file",
      fileId,
    });
    for (const path of [
      "/bands",
      "/bands/",
      "/bands/short",
      `/bands/${BAND}/files/short`,
      `/bands/${BAND}/files/../snapshot`,
      `/bands/${BAND}/snapshot/${fileId}`,
      `/x/${BAND}`,
    ]) {
      expect(routeBand(path)).toBeNull();
    }
    expect(routeBand(`/bands/${BAND.toUpperCase()}`)).toBeNull();
  });

  it("rejects unknown routes, and has no listing", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    for (const path of ["/bands", "/bands/", `/bands/${BAND}/other`, "/bands/not-an-id"]) {
      expect((await call(relay, "GET", path)).status).toBe(404);
    }
    expect((await call(relay, "DELETE", `/bands/${BAND}`)).status).toBe(405);
    expect((await call(relay, "PUT", `/bands/${BAND}`, { body: bytes("x") })).status).toBe(405);
  });
});

describe("band", () => {
  it("is created once and returns its meta to token holders", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);

    const again = await call(relay, "POST", `/bands/${BAND}`, { body: bytes("other") });
    expect(again.status).toBe(409);

    const meta = await call(relay, "GET", `/bands/${BAND}`);
    expect(meta.status).toBe(200);
    expect(await meta.text()).toBe("meta");
  });

  it("stores a hash of the token, not the token", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    expect(relay.onlyBand.band?.authHash).toMatch(/^[0-9a-f]{64}$/);
    expect(relay.onlyBand.band?.authHash).not.toContain(TOKEN);
  });

  it("answers 404 for a band that was never created, without storing anything", async () => {
    const relay = new MemoryRelay();
    expect((await call(relay, "GET", `/bands/${BAND}`)).status).toBe(404);
    expect((await call(relay, "GET", `/bands/${BAND}/snapshot`)).status).toBe(404);
    expect((await putSnapshot(relay, 0, "data")).status).toBe(404);
    expect(relay.store(BAND).band).toBeNull();
    expect(relay.store(BAND).blobs.size).toBe(0);
  });

  it("refuses a missing or wrong token", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    await putSnapshot(relay, 0, "v1");

    for (const path of [`/bands/${BAND}`, `/bands/${BAND}/snapshot`]) {
      expect((await call(relay, "GET", path, { token: null })).status).toBe(401);
      expect((await call(relay, "GET", path, { token: "wrong" })).status).toBe(403);
    }
    const write = await call(relay, "PUT", `/bands/${BAND}/snapshot`, {
      token: "wrong",
      version: 1,
      body: bytes("hacked"),
    });
    expect(write.status).toBe(403);
    expect(await snapshotText(relay)).toBe("v1");
  });
});

describe("snapshot", () => {
  it("is empty at version 0, then each write bumps the version", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);

    const empty = await call(relay, "GET", `/bands/${BAND}/snapshot`);
    expect(empty.status).toBe(204);
    expect(empty.headers.get(VERSION_HEADER)).toBe("0");

    const first = await putSnapshot(relay, 0, "v1");
    expect(first.status).toBe(200);
    expect(first.headers.get(VERSION_HEADER)).toBe("1");

    const second = await putSnapshot(relay, 1, "v2");
    expect(second.headers.get(VERSION_HEADER)).toBe("2");

    const read = await call(relay, "GET", `/bands/${BAND}/snapshot`);
    expect(read.headers.get(VERSION_HEADER)).toBe("2");
    expect(await read.text()).toBe("v2");
  });

  it("refuses a write based on a stale version and keeps the current data", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    await putSnapshot(relay, 0, "v1");

    const stale = await putSnapshot(relay, 0, "lost update");
    expect(stale.status).toBe(412);
    expect(stale.headers.get(VERSION_HEADER)).toBe("1");
    expect((await putSnapshot(relay, 2, "from the future")).status).toBe(412);
    expect(await snapshotText(relay)).toBe("v1");
  });

  it("lets exactly one of two concurrent writers win", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    await putSnapshot(relay, 0, "v1");

    const results = await Promise.all([putSnapshot(relay, 1, "A"), putSnapshot(relay, 1, "B")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
    expect(relay.onlyBand.band?.version).toBe(2);
    const winner = results[0].status === 200 ? "A" : "B";
    expect(await snapshotText(relay)).toBe(winner);
  });

  it("needs a version and a body", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    const noVersion = await call(relay, "PUT", `/bands/${BAND}/snapshot`, { body: bytes("x") });
    expect(noVersion.status).toBe(400);
    const badVersion = await call(relay, "PUT", `/bands/${BAND}/snapshot`, {
      version: -1,
      body: bytes("x"),
    });
    expect(badVersion.status).toBe(400);
    expect((await call(relay, "PUT", `/bands/${BAND}/snapshot`, { version: 0 })).status).toBe(400);
  });

  it("stores a snapshot larger than one chunk", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    const big = new Uint8Array(CHUNK_BYTES * 2 + 123).map((_, i) => i % 251);

    expect((await putSnapshot(relay, 0, "small")).status).toBe(200);
    const res = await call(relay, "PUT", `/bands/${BAND}/snapshot`, { version: 1, body: big });
    expect(res.status).toBe(200);
    expect(relay.onlyBand.blobs.get("snapshot")?.length).toBe(3);

    const read = await call(relay, "GET", `/bands/${BAND}/snapshot`);
    expect(Buffer.from(await read.arrayBuffer()).equals(big)).toBe(true);
  });
});

describe("size limits", () => {
  it("refuses an oversized snapshot", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    await putSnapshot(relay, 0, "v1");

    const res = await call(relay, "PUT", `/bands/${BAND}/snapshot`, {
      version: 1,
      body: new Uint8Array(MAX_SNAPSHOT_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect(await snapshotText(relay)).toBe("v1");

    const atLimit = await call(relay, "PUT", `/bands/${BAND}/snapshot`, {
      version: 1,
      body: new Uint8Array(MAX_SNAPSHOT_BYTES),
    });
    expect(atLimit.status).toBe(200);
  });

  it("refuses an oversized body from its declared length alone", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    const res = await relay.fetch(`${relay.url}/bands/${BAND}/snapshot`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        [VERSION_HEADER]: "0",
        "Content-Length": String(MAX_SNAPSHOT_BYTES + 1),
      },
      body: bytes("short"),
    });
    expect(res.status).toBe(413);
  });

  it("refuses oversized band meta", async () => {
    const relay = new MemoryRelay();
    const res = await call(relay, "POST", `/bands/${BAND}`, {
      body: new Uint8Array(MAX_META_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect(relay.store(BAND).band).toBeNull();
  });
});

describe("origins", () => {
  it("parses the allowlist variable", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins(" https://a.example/ ,https://b.example,")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("accepts listed origins and local dev servers", () => {
    const allowed = ["https://band.example"];
    expect(isAllowedOrigin("https://band.example", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3002", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("https://localhost.evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("https://anything.example", [])).toBe(true);
  });

  it("answers preflights and exposes the version header to the app", async () => {
    const relay = new MemoryRelay();
    relay.allowedOrigins = ["https://band.example"];
    const origin = "https://band.example";

    const preflight = await call(relay, "OPTIONS", `/bands/${BAND}/snapshot`, {
      origin,
      token: null,
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(VERSION_HEADER);

    const created = await call(relay, "POST", `/bands/${BAND}`, { origin, body: bytes("meta") });
    expect(created.status).toBe(201);
    expect(created.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(created.headers.get("Access-Control-Expose-Headers")).toBe(VERSION_HEADER);
  });

  it("refuses other websites", async () => {
    const relay = new MemoryRelay();
    relay.allowedOrigins = ["https://band.example"];
    const res = await call(relay, "POST", `/bands/${BAND}`, {
      origin: "https://evil.example",
      body: bytes("meta"),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(relay.bands.size).toBe(0);
  });
});

describe("live channel", () => {
  function upgrade(protocols: string | null, upgradeHeader = "websocket"): Request {
    const headers = new Headers({ Upgrade: upgradeHeader });
    if (protocols) headers.set("Sec-WebSocket-Protocol", protocols);
    return new Request(`https://relay.test/bands/${BAND}/live`, { headers });
  }

  async function refusal(request: Request, relay: MemoryRelay, peers = 0): Promise<number | null> {
    return (await refuseLive(request, relay.store(BAND), peers))?.status ?? null;
  }

  it("lets a device holding the band token in", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    expect(await refusal(upgrade(`${LIVE_PROTOCOL}, ${TOKEN}`), relay)).toBeNull();
  });

  it("refuses a wrong or missing token, an unknown band and plain requests", async () => {
    const relay = new MemoryRelay();
    expect(await refusal(upgrade(`${LIVE_PROTOCOL}, ${TOKEN}`), relay)).toBe(404);
    await createBand(relay);
    expect(await refusal(upgrade(`${LIVE_PROTOCOL}, guess`), relay)).toBe(403);
    expect(await refusal(upgrade(LIVE_PROTOCOL), relay)).toBe(401);
    expect(await refusal(upgrade(null), relay)).toBe(401);
    expect(await refusal(upgrade(`${LIVE_PROTOCOL}, ${TOKEN}`, "h2c"), relay)).toBe(426);
  });

  it("caps the number of connected devices", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    const request = () => upgrade(`${LIVE_PROTOCOL}, ${TOKEN}`);
    expect(await refusal(request(), relay, MAX_LIVE_PEERS - 1)).toBeNull();
    expect(await refusal(request(), relay, MAX_LIVE_PEERS)).toBe(429);
  });

  it("is not reachable as a plain route", async () => {
    const relay = new MemoryRelay();
    await createBand(relay);
    expect(routeBand(`/bands/${BAND}/live`)).toEqual({ bandId: BAND, resource: "live" });
    expect((await call(relay, "GET", `/bands/${BAND}/live`)).status).toBe(404);
  });
});
