const SENTINEL_KEY = "openSetlistUnsaved";

/**
 * The state of the extra history entry pushed while a form has unsaved changes,
 * so the browser Back button lands on the same page first and the app can ask.
 */
export function sentinelState(): Record<string, true> {
  return { [SENTINEL_KEY]: true };
}

export function isSentinelState(state: unknown): boolean {
  return typeof state === "object" && state !== null && SENTINEL_KEY in state;
}
