// Band relay: one opaque (client-encrypted) snapshot per band, with compare-and-swap on a
// version counter, plus the band's write-once files (sheet music). Request handling only: storage is injected, see the Durable Object in index.js.

export const VERSION_HEADER = "X-Band-Version";
export const MAX_META_BYTES = 4 * 1024;
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
/** A SQLite Durable Object row holds 2 MB at most, so blobs are stored in chunks. */
export const CHUNK_BYTES = 1024 * 1024;

export type BlobKey = "meta" | "snapshot" | `file:${string}`;

export interface BandStore {
  /** null until the band is created. */
  load(): { authHash: string; version: number } | null;
  create(authHash: string, meta: Uint8Array): void;
  read(key: BlobKey): Uint8Array<ArrayBuffer> | null;
  /** Replaces the snapshot and sets the version in one transaction. */
  writeSnapshot(data: Uint8Array, version: number): void;
  fileIds(): string[];
  writeFile(fileId: string, data: Uint8Array): void;
}

export interface BandRoute {
  bandId: string;
  resource: "band" | "snapshot" | "files" | "file";
  fileId?: string;
}

/**
 * `/bands/<128-bit hex id>`, then `/snapshot`, `/files` or `/files/<uuid>`.
 * Anything else is not a relay route.
 */
export function routeBand(pathname: string): BandRoute | null {
  const match = /^\/bands\/([0-9a-f]{32})(?:\/(snapshot|files)(?:\/([0-9a-f-]{36}))?)?$/.exec(
    pathname,
  );
  if (!match) return null;
  const [, bandId, resource, fileId] = match;
  if (!resource) return { bandId, resource: "band" };
  if (!fileId) return { bandId, resource: resource === "files" ? "files" : "snapshot" };
  return resource === "files" ? { bandId, resource: "file", fileId } : null;
}

export function maxBodyBytes(route: BandRoute): number {
  return route.resource === "file" ? MAX_FILE_BYTES : MAX_SNAPSHOT_BYTES;
}

export function splitChunks(data: Uint8Array, size = CHUNK_BYTES): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < data.length; offset += size) {
    chunks.push(data.slice(offset, offset + size));
  }
  return chunks;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function reply(status: number, body: BodyInit | null = null, version?: number): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (version !== undefined) headers.set(VERSION_HEADER, String(version));
  if (body instanceof Uint8Array) headers.set("Content-Type", "application/octet-stream");
  return new Response(body, { status, headers });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The request body, or null when it is larger than `max`. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("Content-Length") ?? 0) > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return joinChunks(chunks);
}

function parseVersion(value: string | null): number | null {
  if (!value || !/^\d{1,15}$/.test(value)) return null;
  return Number(value);
}

/**
 * Runs inside the band's Durable Object. Bodies are read before the store is touched and the
 * store is synchronous, so each check-then-write below is atomic.
 */
export async function handleBandRequest(request: Request, store: BandStore): Promise<Response> {
  const route = routeBand(new URL(request.url).pathname);
  if (!route) return reply(404, "Not found");

  const token = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return reply(401, "Missing band token");
  const authHash = await sha256Hex(token);
  const { method } = request;

  if (route.resource === "band" && method === "POST") {
    const meta = await readCapped(request, MAX_META_BYTES);
    if (!meta) return reply(413, "Body too large");
    if (meta.length === 0) return reply(400, "Missing body");
    if (store.load()) return reply(409, "Band already exists");
    store.create(authHash, meta);
    return reply(201, null, 0);
  }

  const writing = (route.resource === "snapshot" || route.resource === "file") && method === "PUT";
  if (method !== "GET" && !writing) return reply(405, "Method not allowed");
  const body = writing ? await readCapped(request, maxBodyBytes(route)) : null;
  if (writing && !body) return reply(413, "Body too large");

  const band = store.load();
  if (!band) return reply(404, "Unknown band");
  if (band.authHash !== authHash) return reply(403, "Wrong band token");

  if (route.resource === "band") return reply(200, store.read("meta"), band.version);

  if (route.resource === "files") {
    return reply(200, JSON.stringify(store.fileIds()), band.version);
  }

  if (route.fileId) {
    const { fileId } = route;
    if (!body) {
      const file = store.read(`file:${fileId}`);
      return file ? reply(200, file, band.version) : reply(204, null, band.version);
    }
    if (body.length === 0) return reply(400, "Missing body");
    // Write-once: a file never changes under its id
    if (!store.fileIds().includes(fileId)) store.writeFile(fileId, body);
    return reply(200, null, band.version);
  }

  if (!body) {
    if (band.version === 0) return reply(204, null, 0);
    return reply(200, store.read("snapshot"), band.version);
  }

  const expected = parseVersion(request.headers.get(VERSION_HEADER));
  if (expected === null) return reply(400, `Missing ${VERSION_HEADER}`);
  if (body.length === 0) return reply(400, "Missing body");
  if (expected !== band.version) return reply(412, "Band changed", band.version);
  store.writeSnapshot(body, expected + 1);
  return reply(200, null, expected + 1);
}

/** An empty allowlist accepts every origin. Local dev servers are always accepted. */
export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (allowed.length === 0 || allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** "https://a.example, https://b.example" (the ALLOWED_ORIGINS variable) as a list. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Entry point for `/bands/*` in the worker: origin check, CORS and routing, then `forward`
 * hands the request to the Durable Object of that band.
 */
export async function handleRelayRequest(
  request: Request,
  allowedOrigins: string[],
  forward: (bandId: string, request: Request) => Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) return reply(403, "Origin not allowed");

  const cors = {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": `Authorization, Content-Type, ${VERSION_HEADER}`,
    "Access-Control-Expose-Headers": VERSION_HEADER,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const withCors = (response: Response): Response => {
    const result = new Response(response.body, response);
    for (const [name, value] of Object.entries(cors)) result.headers.set(name, value);
    return result;
  };

  if (request.method === "OPTIONS") return withCors(reply(204));
  const route = routeBand(new URL(request.url).pathname);
  if (!route) return withCors(reply(404, "Not found"));
  if (Number(request.headers.get("Content-Length") ?? 0) > maxBodyBytes(route)) {
    return withCors(reply(413, "Body too large"));
  }
  return withCors(await forward(route.bandId, request));
}
