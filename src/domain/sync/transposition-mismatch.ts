import type { Song } from "@db/song";

export interface TranspositionMismatch {
  songId: string;
  songTitle: string;
  localTransposition: number;
  remoteTransposition: number;
}

export function detectTranspositionMismatches(
  localSongs: Song[],
  remoteSongs: Song[],
): TranspositionMismatch[] {
  const remoteMap = new Map(remoteSongs.map((s) => [s.id, s]));
  const mismatches: TranspositionMismatch[] = [];

  for (const local of localSongs) {
    const remote = remoteMap.get(local.id);
    if (!remote) continue;
    const localT = local.transposition ?? 0;
    const remoteT = remote.transposition ?? 0;
    if (localT !== remoteT) {
      mismatches.push({
        songId: local.id,
        songTitle: local.title,
        localTransposition: localT,
        remoteTransposition: remoteT,
      });
    }
  }

  return mismatches;
}
