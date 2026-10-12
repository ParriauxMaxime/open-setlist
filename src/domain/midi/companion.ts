/**
 * Client of the companion program (`companion/`): a small program on the stage computer
 * that plays the MIDI messages it receives and tells the tablets which song the leader
 * is on. It is reached on the band's own Wi-Fi router, never through the internet.
 *
 * The app is served over HTTPS and the companion speaks plain HTTP on a private address:
 * Chrome allows it after asking the musician once ("Local Network Access").
 */

import { z } from "zod";

const REQUEST_TIMEOUT_MS = 4000;
/** Seconds the companion holds a position request open before answering "nothing new". */
const POSITION_WAIT_SECONDS = 25;

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
  bluetooth: z.string().optional(),
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

export interface CompanionOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

async function request(
  url: string,
  init: RequestInit,
  options: CompanionOptions,
  timeoutMs = REQUEST_TIMEOUT_MS,
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

export async function sendToCompanion(
  base: string,
  messages: number[][],
  from: string,
  options: CompanionOptions = {},
): Promise<void> {
  const res = await request(`${base}/midi`, post({ messages, from }), options);
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
 * The leader's position once it is newer than `after`; null when nothing changed during
 * the wait. Call it in a loop with the returned `seq`.
 */
export async function waitPosition(
  base: string,
  after: number,
  options: CompanionOptions = {},
): Promise<{ seq: number; position: StagePosition } | null> {
  const url = `${base}/position?after=${after}&wait=${POSITION_WAIT_SECONDS}`;
  const res = await request(url, {}, options, (POSITION_WAIT_SECONDS + 5) * 1000);
  if (res.status === 204) return null;
  const reply = positionReplySchema.safeParse(await res.json().catch(() => null));
  if (!res.ok || !reply.success) throw new CompanionError(COMPANION_ERROR.rejected);
  return reply.data;
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
