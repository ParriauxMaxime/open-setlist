export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** Compact age of a timestamp, e.g. "12 min", "3h", "2d". */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "< 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * A typed song length as seconds: `"5:34"` → 334, a bare number is minutes (`"4"` → 240).
 * undefined for an empty field, null when it cannot be read.
 */
export function parseDuration(text: string): number | undefined | null {
  const value = text.trim();
  if (!value) return undefined;
  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  return seconds > 0 ? seconds : undefined;
}
