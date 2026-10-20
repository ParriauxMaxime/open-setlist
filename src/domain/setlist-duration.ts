export interface SetlistDuration {
  /** Sum of the known song lengths, in seconds. */
  total: number;
  /** Songs counted out of the total for lack of a length. */
  unknownCount: number;
}

/** Length of a run of songs, a song played twice counting twice. */
export function setlistDuration(
  songIds: readonly string[],
  songs: Iterable<{ id: string; duration?: number } | undefined>,
): SetlistDuration {
  const lengths = new Map<string, number>();
  for (const song of songs) {
    if (song?.duration) lengths.set(song.id, song.duration);
  }
  let total = 0;
  let unknownCount = 0;
  for (const id of songIds) {
    const length = lengths.get(id);
    if (length) total += length;
    else unknownCount++;
  }
  return { total, unknownCount };
}
