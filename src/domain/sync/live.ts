/**
 * Live session: during a gig, one device leads and the devices that chose to follow jump
 * to the song it is on. Opt-in per device and off by default: many bands prefer that each
 * musician turns their own pages.
 *
 * Messages go through the band relay's live channel, sealed with the band key like the
 * rest: the relay passes them on unread. Only song changes travel, never scrolling.
 */

import { z } from "zod";
import { relayBaseUrl } from "./adapters/relay";
import { type BandKeys, deriveBandKeys, openBlob, sealBlob } from "./band-code";

export const LIVE_MODE = {
  off: "off",
  follow: "follow",
  lead: "lead",
} as const;

export type LiveMode = (typeof LIVE_MODE)[keyof typeof LIVE_MODE];

export const LIVE_MODE_VALUES: LiveMode[] = Object.values(LIVE_MODE);

export const LIVE_STATE = {
  connecting: "connecting",
  open: "open",
} as const;

export type LiveState = (typeof LIVE_STATE)[keyof typeof LIVE_STATE];

const LIVE_PROTOCOL = "open-setlist-live";
const RECONNECT_MIN_MS = 1500;
const RECONNECT_MAX_MS = 15000;

const positionSchema = z.object({
  type: z.literal("position"),
  from: z.string(),
  setlistId: z.string(),
  songId: z.string(),
  index: z.number().int().nonnegative(),
});

const liveMessageSchema = z.discriminatedUnion("type", [
  // A device that just connected asks the leader where the band is
  z.object({ type: z.literal("hello"), from: z.string() }),
  positionSchema,
]);

export type LivePosition = z.infer<typeof positionSchema>;
export type LiveMessage = z.infer<typeof liveMessageSchema>;

/**
 * Where a follower goes for a leader's position: the same slot when it holds the same song,
 * else that song's first slot (their setlist copy differs). null: stay put (another setlist,
 * or a song this device does not have in it).
 */
export function followIndex(
  position: Pick<LivePosition, "setlistId" | "songId" | "index">,
  setlistId: string,
  songIds: string[],
): number | null {
  if (position.setlistId !== setlistId) return null;
  if (songIds[position.index] === position.songId) return position.index;
  const index = songIds.indexOf(position.songId);
  return index === -1 ? null : index;
}

// ---------------------------------------------------------------------------
// This device's choice (per profile)
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = "open-setlist-live-mode";

export function loadLiveMode(profileId: string): LiveMode {
  const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}-${profileId}`);
  return LIVE_MODE_VALUES.find((mode) => mode === stored) ?? LIVE_MODE.off;
}

export function saveLiveMode(profileId: string, mode: LiveMode): void {
  const key = `${STORAGE_KEY_PREFIX}-${profileId}`;
  if (mode === LIVE_MODE.off) localStorage.removeItem(key);
  else localStorage.setItem(key, mode);
}

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

export function sealLiveMessage(
  keys: BandKeys,
  message: LiveMessage,
): Promise<Uint8Array<ArrayBuffer>> {
  return sealBlob(keys, "live", 0, JSON.stringify(message));
}

/** null for anything that is not a message of this band: wrong key, tampered, unknown shape. */
export async function openLiveMessage(
  keys: BandKeys,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<LiveMessage | null> {
  try {
    const parsed = liveMessageSchema.safeParse(JSON.parse(await openBlob(keys, "live", 0, sealed)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export interface LiveChannel {
  /** Dropped when the channel is not open: positions are asked again on reconnect. */
  send(message: LiveMessage): void;
  close(): void;
}

export interface LiveChannelHandlers {
  onMessage(message: LiveMessage): void;
  onState(state: LiveState): void;
}

export interface LiveChannelOptions {
  relayUrl?: string;
  createSocket?: (url: string, protocols: string[]) => WebSocket;
}

/** Connects to the band's live channel and keeps reconnecting until closed. */
export function openLiveChannel(
  code: string,
  handlers: LiveChannelHandlers,
  options: LiveChannelOptions = {},
): LiveChannel {
  const base = relayBaseUrl(options.relayUrl);
  const createSocket =
    options.createSocket ?? ((url: string, protocols: string[]) => new WebSocket(url, protocols));
  let socket: WebSocket | null = null;
  let keys: BandKeys | null = null;
  let closed = false;
  let retryMs = RECONNECT_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    if (closed || !base) return;
    handlers.onState(LIVE_STATE.connecting);
    keys ??= await deriveBandKeys(code);
    if (closed) return;
    const bandKeys = keys;
    const url = `${base.replace(/^http/, "ws")}/bands/${bandKeys.bandId}/live`;
    const current = createSocket(url, [LIVE_PROTOCOL, bandKeys.authToken]);
    current.binaryType = "arraybuffer";
    socket = current;

    current.onopen = () => {
      retryMs = RECONNECT_MIN_MS;
      handlers.onState(LIVE_STATE.open);
    };
    current.onmessage = async (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const message = await openLiveMessage(bandKeys, new Uint8Array(event.data));
      if (message && !closed) handlers.onMessage(message);
    };
    current.onclose = () => {
      if (closed || socket !== current) return;
      handlers.onState(LIVE_STATE.connecting);
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
    };
  };
  connect();

  return {
    send(message) {
      const current = socket;
      if (!keys || !current || current.readyState !== WebSocket.OPEN) return;
      sealLiveMessage(keys, message).then((sealed) => {
        if (current.readyState === WebSocket.OPEN) current.send(sealed);
      });
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
