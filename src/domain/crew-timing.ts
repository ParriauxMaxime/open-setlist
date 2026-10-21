/**
 * Countdown for the crew view: how long until the last song ends, from the song lengths.
 * Songs without a length count for nothing and are reported apart.
 */

interface RemainingInput {
  /** Length of each song in setlist order, in seconds; undefined when unknown. */
  durations: readonly (number | undefined)[];
  currentIndex: number;
  /** Time since the current song started. */
  elapsedSeconds: number;
}

/** What is left of the current song (never below 0) plus every song after it, in seconds. */
export function remainingSeconds({
  durations,
  currentIndex,
  elapsedSeconds,
}: RemainingInput): number {
  if (currentIndex < 0 || currentIndex >= durations.length) return 0;
  const current = Math.max(0, (durations[currentIndex] ?? 0) - Math.max(0, elapsedSeconds));
  const after = durations.slice(currentIndex + 1).reduce<number>((sum, d) => sum + (d ?? 0), 0);
  return current + after;
}

/** Songs from the current one on whose length is unknown: the countdown leaves them out. */
export function unknownRemaining(
  durations: readonly (number | undefined)[],
  currentIndex: number,
): number {
  return durations.slice(Math.max(0, currentIndex)).filter((d) => !d).length;
}

/** When the set ends if it runs as planned. */
export function estimatedEnd(now: number, remaining: number): Date {
  return new Date(now + remaining * 1000);
}
