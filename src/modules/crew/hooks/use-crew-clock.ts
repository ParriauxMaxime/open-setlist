import { useCallback, useEffect, useState } from "react";

const TICK_MS = 30_000;

export interface CrewClock {
  now: number;
  /** When the current song started: a tap, a jump from the leader, any change of song. */
  startedAt: number;
  restart: () => void;
}

/** Time for the countdown: restarts with each song, ticks every 30 s in between. */
export function useCrewClock(currentIndex: number): CrewClock {
  const [clock, setClock] = useState(() => {
    const now = Date.now();
    return { now, startedAt: now };
  });

  const restart = useCallback(() => {
    const now = Date.now();
    setClock({ now, startedAt: now });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the trigger
  useEffect(() => {
    restart();
  }, [currentIndex, restart]);

  useEffect(() => {
    const timer = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { ...clock, restart };
}
