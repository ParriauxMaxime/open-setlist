/**
 * Song readiness: where a song stands in the band's repertoire.
 *
 * `status` is optional on Song and synced with the band like any other song field.
 * A song without a status (every song created before this field existed, Setlist
 * Helper imports, new songs where nobody picked one) counts as "ready", so existing
 * catalogs and setlists look and behave exactly as before.
 */

export const SongStatus = {
  Idea: "idea",
  Rehearsing: "rehearsing",
  Ready: "ready",
  Retired: "retired",
} as const;

export type SongStatus = (typeof SongStatus)[keyof typeof SongStatus];

/** Lifecycle order, used for the editor control, filter options and sorting. */
export const SONG_STATUS_LIST = [
  SongStatus.Idea,
  SongStatus.Rehearsing,
  SongStatus.Ready,
  SongStatus.Retired,
] as const;

export const DEFAULT_SONG_STATUS: SongStatus = SongStatus.Ready;

export function resolveSongStatus(status: SongStatus | undefined): SongStatus {
  return status ?? DEFAULT_SONG_STATUS;
}

/** Narrow untrusted input (form or select value) to a status. */
export function parseSongStatus(value: string): SongStatus | undefined {
  return SONG_STATUS_LIST.find((status) => status === value);
}

export function songStatusLabelKey(status: SongStatus): `songStatus.${SongStatus}` {
  return `songStatus.${status}`;
}

/** Position in the lifecycle, for sorting. */
export function songStatusRank(status: SongStatus | undefined): number {
  return SONG_STATUS_LIST.indexOf(resolveSongStatus(status));
}

/** Still being learned: should not end up in a gig setlist by accident. */
export function isSongNotReady(status: SongStatus | undefined): boolean {
  const resolved = resolveSongStatus(status);
  return resolved === SongStatus.Idea || resolved === SongStatus.Rehearsing;
}

/** Distinct songs of a setlist that are not ready. Songs missing from `songs` are ignored. */
export function countNotReadySongs(
  sets: readonly { songIds: readonly string[] }[],
  songs: Iterable<{ id: string; status?: SongStatus } | undefined>,
): number {
  const notReady = new Set<string>();
  for (const song of songs) {
    if (song && isSongNotReady(song.status)) notReady.add(song.id);
  }
  const counted = new Set<string>();
  for (const set of sets) {
    for (const id of set.songIds) {
      if (notReady.has(id)) counted.add(id);
    }
  }
  return counted.size;
}

/** Catalog filter value that hides retired songs (the default view). */
export const ACTIVE_STATUS_FILTER = "active";

export const SONG_STATUS_FILTER_LIST = [ACTIVE_STATUS_FILTER, ...SONG_STATUS_LIST] as const;

/** `filter` is a status, ACTIVE_STATUS_FILTER, or empty for every song. */
export function matchesStatusFilter(
  status: SongStatus | undefined,
  filter: string | undefined,
): boolean {
  if (!filter) return true;
  const resolved = resolveSongStatus(status);
  if (filter === ACTIVE_STATUS_FILTER) return resolved !== SongStatus.Retired;
  return resolved === filter;
}
