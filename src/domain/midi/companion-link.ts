/**
 * The app's link to the paired companion program, kept up on every page from launch to
 * close: it finds the companion, then reports this device every few seconds. Once paired,
 * the app connects on its own at each launch; Disconnect pauses it until Connect.
 */

import {
  COMPANION_ERROR,
  CompanionError,
  type CompanionOptions,
  type CompanionStatus,
  type DevicePresence,
  postPresence,
  probeCompanion,
} from "./companion";

export const COMPANION_LINK = {
  /** No companion paired. */
  off: "off",
  /** Paired, but disconnected by hand. */
  paused: "paused",
  /** Looking for it, not reached yet since launch. */
  connecting: "connecting",
  connected: "connected",
  /** Reached earlier, not answering now: retrying. */
  lost: "lost",
} as const;

export type CompanionLinkState = (typeof COMPANION_LINK)[keyof typeof COMPANION_LINK];

export const COMPANION_LINK_VALUES: CompanionLinkState[] = Object.values(COMPANION_LINK);

export const HEARTBEAT_MS = 5000;
const FIRST_RETRY_MS = 2000;
const MAX_RETRY_MS = 30_000;

/** 2 s, 4 s, 8 s… up to 30 s between attempts while the companion does not answer. */
export function retryDelay(attempt: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
}

export interface CompanionLink {
  state: CompanionLinkState;
  base: string;
  /** What the companion said when it was last reached. */
  status: CompanionStatus | null;
}

// ---------------------------------------------------------------------------
// State, for useSyncExternalStore
// ---------------------------------------------------------------------------

let link: CompanionLink = { state: COMPANION_LINK.off, base: "", status: null };
let listeners: Array<() => void> = [];

export function companionLink(): CompanionLink {
  return link;
}

export function subscribeCompanionLink(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function setCompanionLink(next: CompanionLink): void {
  if (next.state === link.state && next.base === link.base && next.status === link.status) return;
  link = next;
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

let nudges = new Set<() => void>();

/** Sends the next heartbeat now: what it reports has changed. */
export function nudgeHeartbeat(): void {
  const waiting = nudges;
  nudges = new Set();
  for (const wake of waiting) wake();
}

/** Resolves after `ms`, at the next nudge, or when aborted, whichever comes first. */
export function waitForNudge(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      nudges.delete(done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    nudges.add(done);
    signal.addEventListener("abort", done);
  });
}

/** Resolves after `ms`, or at once when aborted. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

export interface RunLinkOptions extends Pick<CompanionOptions, "fetch"> {
  signal: AbortSignal;
  /** Read at each heartbeat. */
  presence: () => DevicePresence;
  /** The companion answered over the other scheme: save it, the link restarts there. */
  onMoved: (base: string) => void;
  /** Between heartbeats. */
  waitBeat?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Between attempts to reach it. */
  waitRetry?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Keeps the link to the companion at `base` up until aborted, publishing its state. */
export async function runCompanionLink(base: string, options: RunLinkOptions): Promise<void> {
  const { signal } = options;
  const waitBeat = options.waitBeat ?? waitForNudge;
  const waitRetry = options.waitRetry ?? sleep;
  const request = { fetch: options.fetch, signal };
  let attempt = 0;
  let reached = false;
  setCompanionLink({ state: COMPANION_LINK.connecting, base, status: null });

  while (!signal.aborted) {
    try {
      const found = await probeCompanion(base, request);
      if (found.base !== base) return options.onMoved(found.base);
      reached = true;
      attempt = 0;
      setCompanionLink({ state: COMPANION_LINK.connected, base, status: found.status });
      while (!signal.aborted) {
        await postPresence(base, options.presence(), request).catch((err: unknown) => {
          // A companion older than /presence refuses it, and still plays MIDI
          if (err instanceof CompanionError && err.kind === COMPANION_ERROR.rejected) return;
          throw err;
        });
        await waitBeat(HEARTBEAT_MS, signal);
      }
    } catch {
      if (signal.aborted) return;
      setCompanionLink({
        state: reached ? COMPANION_LINK.lost : COMPANION_LINK.connecting,
        base,
        status: link.status,
      });
      await waitRetry(retryDelay(attempt++), signal);
    }
  }
}
