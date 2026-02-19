import { searchItunes } from "./adapters/itunes";
import type { SongSearchResult } from "./types";

/**
 * Search for songs by query string.
 * Returns results ranked by popularity.
 */
export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<SongSearchResult[]> {
  return searchItunes(query, signal);
}
