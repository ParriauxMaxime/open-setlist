/**
 * Client of the companion program (`companion/`): a small program on the stage computer
 * that plays the MIDI messages it receives and tells the tablets which song the leader
 * is on. It is reached on the band's own Wi-Fi router, never through the internet.
 *
 * The app is served over HTTPS and the companion sits on a private address, where it
 * answers both HTTPS, with a self-signed certificate, and plain HTTP, on the same port.
 * Chrome lets the plain call through after asking the musician once ("Local Network
 * Access"); Firefox and Safari only take the HTTPS one, after the musician accepted the
 * certificate on the companion's own page.
 */

import { z } from "zod";
import { FOLLOW_MODE, type FollowMode, MIDI_TRANSPORT, otherScheme } from "./settings";

const REQUEST_TIMEOUT_MS = 4000;
/** Seconds the companion holds a position, devices or log request open before answering "nothing new". */
export const LONG_POLL_SECONDS = 25;
/** How long a sound change may take to be echoed by the gear before it counts as not taken. */
export const FEEDBACK_WAIT_SECONDS = 5;

export const COMPANION_ERROR = {
  /** Wrong address, program not running, another network, or permission refused. */
  unreachable: "unreachable",
  /** The program runs but has no MIDI output to play on. */
  noMidiOutput: "noMidiOutput",
  rejected: "rejected",
} as const;

export type CompanionErrorKind = (typeof COMPANION_ERROR)[keyof typeof COMPANION_ERROR];

export class CompanionError extends Error {
  constructor(readonly kind: CompanionErrorKind) {
    super(`Companion: ${kind}`);
    this.name = "CompanionError";
  }
}

const statusSchema = z.object({
  app: z.literal("open-setlist-companion"),
  version: z.string(),
  name: z.string(),
  midiOut: z.string().nullable(),
  /** The input the gear answers on. */
  midiIn: z.string().nullable().optional(),
  bluetooth: z.string().optional(),
  /** Seconds since the program started. */
  uptime: z.number().optional(),
});

export type CompanionStatus = z.infer<typeof statusSchema>;

const positionSchema = z.object({
  from: z.string(),
  setlistId: z.string(),
  songId: z.string(),
  index: z.number().int().nonnegative(),
});

/** Where a leading device is: the song, and its slot in the setlist. */
export type StagePosition = z.infer<typeof positionSchema>;

const positionReplySchema = z.object({ seq: z.number().int(), position: positionSchema });

const feedbackSchema = z.object({
  seq: z.number().int(),
  /** The last value of each control the gear sent back, as MIDI messages. */
  state: z.array(z.array(z.number().int())),
});

export type CompanionFeedback = z.infer<typeof feedbackSchema>;

export const MIDI_LAST_SEND = {
  ok: "ok",
  failed: "failed",
  /** Nothing sent since the app started. */
  none: "none",
} as const;

export type MidiLastSend = (typeof MIDI_LAST_SEND)[keyof typeof MIDI_LAST_SEND];

export const MIDI_LAST_SEND_VALUES: MidiLastSend[] = Object.values(MIDI_LAST_SEND);

/** The transport a device reports: `off` when it sends no MIDI. */
export const PRESENCE_TRANSPORT = { ...MIDI_TRANSPORT, off: "off" } as const;

export type PresenceTransport = (typeof PRESENCE_TRANSPORT)[keyof typeof PRESENCE_TRANSPORT];

export const PRESENCE_TRANSPORT_VALUES: PresenceTransport[] = Object.values(PRESENCE_TRANSPORT);

/** What a device tells the companion every few seconds, for the Companion page. */
export interface DevicePresence {
  id: string;
  /** "My name", else its part and platform. */
  name: string;
  part: string;
  platform: string;
  appVersion: string;
  /** Route name: `Catalog`, `Perform`... */
  page: string;
  /** On stage: the setlist, the song and its slot. */
  setlistId?: string;
  songId?: string;
  index?: number;
  follow: FollowMode;
  midi: { transport: PresenceTransport; lastSend: MidiLastSend; channel?: number };
}

const presenceReplySchema = z.object({ seq: z.number().int() });

// Lenient: a device on another version of the app may report more, or less
const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  part: z.string().catch(""),
  platform: z.string().catch(""),
  appVersion: z.string().catch(""),
  page: z.string().catch(""),
  setlistId: z.string().optional().catch(undefined),
  songId: z.string().optional().catch(undefined),
  index: z.number().int().nonnegative().optional().catch(undefined),
  follow: z.string().catch(FOLLOW_MODE.off),
  midi: z
    .object({
      transport: z.string().catch(PRESENCE_TRANSPORT.off),
      lastSend: z.string().catch(MIDI_LAST_SEND.none),
      channel: z.number().int().optional().catch(undefined),
    })
    .catch({ transport: PRESENCE_TRANSPORT.off, lastSend: MIDI_LAST_SEND.none }),
  /** The device's address on the band's network, as the companion saw it. */
  address: z.string().nullable().catch(null),
  /** Companion clock, ms. */
  lastSeen: z.number().catch(0),
});

/** A device the companion has heard from in the last 15 s. */
export type CompanionDevice = z.infer<typeof deviceSchema>;

const devicesReplySchema = z.object({
  seq: z.number().int(),
  /** Companion clock, ms: `lastSeen` is compared with it, not with this device's clock. */
  now: z.number(),
  devices: z.array(z.unknown()).transform((devices) =>
    devices.flatMap((device) => {
      const parsed = deviceSchema.safeParse(device);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

export type CompanionDevices = z.infer<typeof devicesReplySchema>;

const logEntrySchema = z.object({
  seq: z.number().int(),
  /** Companion clock, ms. */
  at: z.number(),
  /** The label the device gave (its part), else its address. */
  from: z.string(),
  /** The device's id, from versions of the app that send it. */
  device: z.string().optional(),
  via: z.string(),
  messages: z.array(z.array(z.number().int())),
});

export type CompanionLogEntry = z.infer<typeof logEntrySchema>;

const logReplySchema = z.object({
  seq: z.number().int(),
  now: z.number(),
  /** Newest first. */
  entries: z.array(logEntrySchema),
});

export type CompanionLog = z.infer<typeof logReplySchema>;

export interface CompanionOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Instead of the usual 4 s, for a request that does not wait on purpose. */
  timeoutMs?: number;
}

async function request(
  url: string,
  init: RequestInit,
  options: CompanionOptions,
  timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return await doFetch(url, { ...init, signal });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    throw new CompanionError(COMPANION_ERROR.unreachable);
  }
}

// `text/plain` keeps the request "simple": no CORS preflight before each song change
function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) };
}

export async function companionStatus(
  base: string,
  options: CompanionOptions = {},
): Promise<CompanionStatus> {
  const res = await request(`${base}/status`, {}, options);
  const status = statusSchema.safeParse(await res.json().catch(() => null));
  // Something answers at that address, but it is not the companion
  if (!res.ok || !status.success) throw new CompanionError(COMPANION_ERROR.unreachable);
  return status.data;
}

/**
 * The companion at `base`, over the scheme this browser lets through: `base` first, then
 * the other one. Rejects with the first failure when neither answers.
 */
export async function probeCompanion(
  base: string,
  options: CompanionOptions = {},
): Promise<{ base: string; status: CompanionStatus }> {
  try {
    return { base, status: await companionStatus(base, options) };
  } catch (err) {
    if (options.signal?.aborted) throw err;
    const fallback = otherScheme(base);
    try {
      return { base: fallback, status: await companionStatus(fallback, options) };
    } catch {
      throw err;
    }
  }
}

export async function sendToCompanion(
  base: string,
  messages: number[][],
  sender: { from: string; device?: string },
  options: CompanionOptions = {},
): Promise<void> {
  const res = await request(`${base}/midi`, post({ messages, ...sender }), options);
  if (res.status === 503) throw new CompanionError(COMPANION_ERROR.noMidiOutput);
  if (!res.ok) throw new CompanionError(COMPANION_ERROR.rejected);
}

export async function postPosition(
  base: string,
  position: StagePosition,
  options: CompanionOptions = {},
): Promise<void> {
  const res = await request(`${base}/position`, post(position), options);
  if (!res.ok) throw new CompanionError(COMPANION_ERROR.rejected);
}

/**
 * The reply to a request the companion holds until it has something newer than `after`;
 * null when nothing changed during the wait. Call it in a loop with the returned `seq`.
 */
async function waitNewer<T>(
  url: string,
  after: number,
  waitSeconds: number,
  schema: z.ZodType<T>,
  options: CompanionOptions,
): Promise<T | null> {
  const res = await request(
    `${url}?after=${after}&wait=${waitSeconds}`,
    {},
    options,
    (waitSeconds + 5) * 1000,
  );
  if (res.status === 204) return null;
  const reply = schema.safeParse(await res.json().catch(() => null));
  if (!res.ok || !reply.success) throw new CompanionError(COMPANION_ERROR.rejected);
  return reply.data;
}

/** The leader's position once it is newer than `after`; null when nothing changed. */
export function waitPosition(
  base: string,
  after: number,
  options: CompanionOptions = {},
): Promise<{ seq: number; position: StagePosition } | null> {
  return waitNewer(`${base}/position`, after, LONG_POLL_SECONDS, positionReplySchema, options);
}

/**
 * What the gear has answered on the companion's MIDI input once it is newer than `after`;
 * null when nothing came during the wait. Ableton echoes the value of each mapped control.
 */
export function waitFeedback(
  base: string,
  after: number,
  options: CompanionOptions = {},
): Promise<CompanionFeedback | null> {
  return waitNewer(`${base}/feedback`, after, FEEDBACK_WAIT_SECONDS, feedbackSchema, options);
}

/** Tells the companion this device is on, and what it shows. Returns the devices' new `seq`. */
export async function postPresence(
  base: string,
  presence: DevicePresence,
  options: CompanionOptions = {},
): Promise<number> {
  const res = await request(`${base}/presence`, post(presence), options);
  const reply = presenceReplySchema.safeParse(await res.json().catch(() => null));
  if (!res.ok || !reply.success) throw new CompanionError(COMPANION_ERROR.rejected);
  return reply.data.seq;
}

/** The devices once one reported, came or left after `after`; null when nothing changed. */
export function waitDevices(
  base: string,
  after: number,
  options: CompanionOptions = {},
  waitSeconds = LONG_POLL_SECONDS,
): Promise<CompanionDevices | null> {
  return waitNewer(`${base}/devices`, after, waitSeconds, devicesReplySchema, options);
}

/** The last 50 batches played, once one is newer than `after`; null when none came. */
export function waitLog(
  base: string,
  after: number,
  options: CompanionOptions = {},
  waitSeconds = LONG_POLL_SECONDS,
): Promise<CompanionLog | null> {
  return waitNewer(`${base}/log`, after, waitSeconds, logReplySchema, options);
}

/** Whether the gear's last known values include every message that was sent. */
export function confirms(state: number[][], sent: number[][]): boolean {
  const known = new Set(state.map((message) => message.join(",")));
  return sent.length > 0 && sent.every((message) => known.has(message.join(",")));
}

/**
 * Resolves once the gear has echoed every message. Rejects when the companion cannot be
 * asked, or when aborted before anything matching came back.
 */
export async function awaitConfirmation(
  base: string,
  sent: number[][],
  options: CompanionOptions = {},
): Promise<void> {
  let after = 0;
  while (!options.signal?.aborted) {
    const feedback = await waitFeedback(base, after, options);
    if (!feedback) continue;
    if (confirms(feedback.state, sent)) return;
    after = feedback.seq;
  }
  throw new DOMException("No confirmation before the wait ended", "AbortError");
}

/**
 * Where a follower goes for a leader's position: the same slot when it holds the same song,
 * else that song's first slot (their setlist copy differs). null: stay put (another setlist,
 * or a song this device does not have in it).
 */
export function followIndex(
  position: Pick<StagePosition, "setlistId" | "songId" | "index">,
  setlistId: string,
  songIds: string[],
): number | null {
  if (position.setlistId !== setlistId) return null;
  if (songIds[position.index] === position.songId) return position.index;
  const index = songIds.indexOf(position.songId);
  return index === -1 ? null : index;
}
