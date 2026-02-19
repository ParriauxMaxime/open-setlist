import { fetchUGChords } from "./adapters/ultimate-guitar";

/**
 * Fetch chord content for a song.
 * Returns ChordPro string or null if unavailable.
 */
export async function fetchChords(title: string, artist: string): Promise<string | null> {
  return fetchUGChords(title, artist);
}
