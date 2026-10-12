import { snapshotSchema } from "@domain/schemas/snapshot";
import { z } from "zod";
import {
  BandBlobError,
  type BandBlobKind,
  type BandKeys,
  deriveBandKeys,
  openBlob,
  openFile,
  sealBlob,
  sealFile,
} from "../band-code";
import type { RelayConfig } from "../config";
import { ConflictError, type RemoteSyncPort } from "../ports/remote-sync.port";

/**
 * URL of the band relay (the Cloudflare Worker in worker/), set at build time
 * with the RELAY_URL environment variable. Empty: band sync is unavailable.
 */
const RELAY_URL = typeof __RELAY_URL__ === "string" ? __RELAY_URL__ : "";

const VERSION_HEADER = "X-Band-Version";

export const RELAY_ERROR = {
  notConfigured: "notConfigured",
  unreachable: "unreachable",
  unknownBand: "unknownBand",
  rejected: "rejected",
  tooLarge: "tooLarge",
  damaged: "damaged",
} as const;
export type RelayErrorKind = (typeof RELAY_ERROR)[keyof typeof RELAY_ERROR];

const MESSAGES: Record<RelayErrorKind, string> = {
  notConfigured: "Band sync is not set up on this copy of the app",
  unreachable: "The sync server cannot be reached",
  unknownBand: "No band matches this code",
  rejected: "The sync server refused this band code",
  tooLarge: "The band's data is too large for the sync server",
  damaged: "The band's data cannot be read with this code",
};

export class RelayError extends Error {
  constructor(readonly kind: RelayErrorKind) {
    super(MESSAGES[kind]);
    this.name = "RelayError";
  }
}

const bandProfileSchema = z.object({ name: z.string().min(1), avatar: z.string().optional() });
export type BandProfile = z.infer<typeof bandProfileSchema>;

export interface RelayOptions {
  relayUrl?: string;
  fetch?: typeof fetch;
}

export function isRelayAvailable(): boolean {
  return Boolean(RELAY_URL);
}

interface RelayClient {
  keys: BandKeys;
  request(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: number; version: number; body: Uint8Array<ArrayBuffer> }>;
  open(kind: BandBlobKind, version: number, sealed: Uint8Array<ArrayBuffer>): Promise<unknown>;
}

async function connect(code: string, options: RelayOptions): Promise<RelayClient> {
  const relayUrl = (options.relayUrl ?? RELAY_URL).replace(/\/+$/, "");
  if (!relayUrl) throw new RelayError(RELAY_ERROR.notConfigured);
  const doFetch = options.fetch ?? fetch;
  const keys = await deriveBandKeys(code);

  return {
    keys,
    async request(path, init = {}) {
      let res: Response;
      try {
        res = await doFetch(`${relayUrl}/bands/${keys.bandId}${path}`, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${keys.authToken}` },
        });
      } catch {
        throw new RelayError(RELAY_ERROR.unreachable);
      }
      if (res.status === 404) throw new RelayError(RELAY_ERROR.unknownBand);
      if (res.status === 403 || res.status === 409) throw new RelayError(RELAY_ERROR.rejected);
      if (res.status === 413) throw new RelayError(RELAY_ERROR.tooLarge);
      // Every relay answer carries the band version: without it, something else replied.
      const version = Number(res.headers.get(VERSION_HEADER) ?? Number.NaN);
      if (!Number.isInteger(version)) throw new RelayError(RELAY_ERROR.unreachable);
      return { status: res.status, version, body: new Uint8Array(await res.arrayBuffer()) };
    },
    async open(kind, version, sealed) {
      try {
        return JSON.parse(await openBlob(keys, kind, version, sealed));
      } catch (err) {
        if (err instanceof BandBlobError || err instanceof SyntaxError) {
          throw new RelayError(RELAY_ERROR.damaged);
        }
        throw err;
      }
    },
  };
}

/** Registers a new band on the relay. Its name travels encrypted, like everything else. */
export async function createBand(
  code: string,
  profile: BandProfile,
  options: RelayOptions = {},
): Promise<void> {
  const relay = await connect(code, options);
  const body = await sealBlob(relay.keys, "meta", 0, JSON.stringify(profile));
  const res = await relay.request("", { method: "POST", body });
  if (res.status !== 201) throw new RelayError(RELAY_ERROR.rejected);
}

/** Checks a code against the relay and returns the band it belongs to. */
export async function fetchBandProfile(
  code: string,
  options: RelayOptions = {},
): Promise<BandProfile> {
  const relay = await connect(code, options);
  const res = await relay.request("");
  if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
  const profile = bandProfileSchema.safeParse(await relay.open("meta", 0, res.body));
  if (!profile.success) throw new RelayError(RELAY_ERROR.damaged);
  return profile.data;
}

export function createRelayAdapter(
  config: RelayConfig,
  options: RelayOptions = {},
): RemoteSyncPort {
  const { code } = config;

  return {
    name: "Band",

    files: {
      async list() {
        const relay = await connect(code, options);
        const res = await relay.request("/files");
        if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
        try {
          return z.array(z.string()).parse(JSON.parse(new TextDecoder().decode(res.body)));
        } catch {
          throw new RelayError(RELAY_ERROR.unreachable);
        }
      },

      async get(fileId) {
        const relay = await connect(code, options);
        const res = await relay.request(`/files/${fileId}`);
        if (res.status === 204) return null;
        if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
        try {
          return new Blob([await openFile(relay.keys, fileId, res.body)]);
        } catch (err) {
          if (err instanceof BandBlobError) throw new RelayError(RELAY_ERROR.damaged);
          throw err;
        }
      },

      async put(fileId, data) {
        const relay = await connect(code, options);
        const content = new Uint8Array(await data.arrayBuffer());
        const res = await relay.request(`/files/${fileId}`, {
          method: "PUT",
          body: await sealFile(relay.keys, fileId, content),
        });
        if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
      },
    },

    isConfigured() {
      return Boolean(code);
    },

    async testConnection() {
      return (await fetchBandProfile(code, options)).name;
    },

    async pull() {
      const relay = await connect(code, options);
      const res = await relay.request("/snapshot");
      if (res.status === 204) return null;
      if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
      const snapshot = snapshotSchema.safeParse(
        await relay.open("snapshot", res.version, res.body),
      );
      if (!snapshot.success) throw new RelayError(RELAY_ERROR.damaged);
      return { snapshot: snapshot.data, versionToken: String(res.version) };
    },

    async push(snapshot, versionToken) {
      const expected = versionToken ? Number(versionToken) : 0;
      if (!Number.isInteger(expected)) throw new ConflictError();
      const relay = await connect(code, options);
      const body = await sealBlob(relay.keys, "snapshot", expected + 1, JSON.stringify(snapshot));
      const res = await relay.request("/snapshot", {
        method: "PUT",
        headers: { [VERSION_HEADER]: String(expected) },
        body,
      });
      if (res.status === 412) throw new ConflictError();
      if (res.status !== 200) throw new RelayError(RELAY_ERROR.unreachable);
      return String(res.version);
    },
  };
}
