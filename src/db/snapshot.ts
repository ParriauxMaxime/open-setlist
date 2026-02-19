import { snapshotSchema } from "@domain/schemas/snapshot";
import { loadTombstones, type Tombstone } from "@domain/sync/tombstones";
import { db } from ".";
import type { Setlist } from "./setlist";
import type { Song } from "./song";

export const SNAPSHOT_VERSION = 2;

export interface Snapshot {
  version: number;
  exportedAt: number;
  songs: Song[];
  setlists: Setlist[];
  tombstones?: Tombstone[];
}

export async function exportSnapshot(): Promise<Snapshot> {
  const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()]);
  const tombstones = loadTombstones();
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    songs,
    setlists,
    ...(tombstones.length > 0 ? { tombstones } : {}),
  };
}

export async function importSnapshot(data: unknown): Promise<void> {
  const snapshot = snapshotSchema.parse(data);
  await db.transaction("rw", db.songs, db.setlists, async () => {
    await db.songs.clear();
    await db.setlists.clear();
    if (snapshot.songs.length > 0) {
      await db.songs.bulkAdd(snapshot.songs);
    }
    if (snapshot.setlists.length > 0) {
      await db.setlists.bulkAdd(snapshot.setlists);
    }
  });
}
