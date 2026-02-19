import type { SongSearchResult } from "../types";

const ITUNES_BASE = "https://itunes.apple.com/search";

interface ITunesResult {
  trackName: string;
  artistName: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
}

interface ITunesResponse {
  resultCount: number;
  results: ITunesResult[];
}

export async function searchItunes(
  query: string,
  signal?: AbortSignal,
): Promise<SongSearchResult[]> {
  const url = `${ITUNES_BASE}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8`;

  const res = await fetch(url, { signal });
  if (!res.ok) return [];

  const data: ITunesResponse = await res.json();

  return data.results.map((item) => ({
    title: item.trackName,
    artist: item.artistName,
    durationMs: item.trackTimeMillis ?? null,
    tags: item.primaryGenreName ? [item.primaryGenreName.toLowerCase()] : [],
  }));
}
