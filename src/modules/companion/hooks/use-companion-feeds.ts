import {
  type CompanionDevices,
  type CompanionLog,
  type CompanionOptions,
  type CompanionStatus,
  companionStatus,
  LONG_POLL_SECONDS,
  waitDevices,
  waitLog,
} from "@domain/midi/companion";
import { HEARTBEAT_MS, sleep } from "@domain/midi/companion-link";
import { useEffect, useState } from "react";

const RETRY_MS = 2000;

type Wait<T> = (
  base: string,
  after: number,
  options: CompanionOptions,
  waitSeconds: number,
) => Promise<T | null>;

/** `undefined` until the first answer; then the latest reply, null when there is none yet. */
function useLongPoll<T extends { seq: number }>(base: string | null, wait: Wait<T>) {
  const [reply, setReply] = useState<T | null | undefined>(undefined);

  useEffect(() => {
    setReply(undefined);
    if (!base) return;
    const abort = new AbortController();
    const { signal } = abort;
    (async () => {
      // The first ask answers at once, even when there is nothing yet
      let after = 0;
      let first = true;
      while (!signal.aborted) {
        try {
          const next = await wait(base, after, { signal }, first ? 0 : LONG_POLL_SECONDS);
          if (next) {
            after = next.seq;
            setReply(next);
          } else if (first) setReply(null);
          first = false;
        } catch {
          if (signal.aborted) return;
          // A restarted companion counts from 1 again
          after = 0;
          first = true;
          await sleep(RETRY_MS, signal);
        }
      }
    })();
    return () => abort.abort();
  }, [base, wait]);

  return reply;
}

/** The devices the companion heard from in the last 15 s, while `base` is set. */
export function useCompanionDevices(base: string | null): CompanionDevices | null | undefined {
  return useLongPoll(base, waitDevices);
}

/** The last 50 batches the companion played, newest first, while `base` is set. */
export function useCompanionLog(base: string | null): CompanionLog | null | undefined {
  return useLongPoll(base, waitLog);
}

/** The companion's status, asked again every 5 s while `base` is set. */
export function useCompanionStatus(base: string | null): CompanionStatus | null {
  const [status, setStatus] = useState<CompanionStatus | null>(null);

  useEffect(() => {
    if (!base) return setStatus(null);
    const abort = new AbortController();
    const { signal } = abort;
    (async () => {
      while (!signal.aborted) {
        try {
          setStatus(await companionStatus(base, { signal }));
        } catch {
          if (signal.aborted) return;
        }
        await sleep(HEARTBEAT_MS, signal);
      }
    })();
    return () => abort.abort();
  }, [base]);

  return status;
}
