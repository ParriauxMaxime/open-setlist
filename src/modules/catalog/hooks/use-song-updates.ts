import { useDb } from "@db/provider";
import type { SongStatus } from "@domain/song-status";
import { addTag as withTag } from "@domain/song-tags";
import { useCallback } from "react";

/** Status and tag changes from the catalog, one song or many, in one transaction. */
export function useSongUpdates() {
  const db = useDb();

  const setStatus = useCallback(
    (songIds: readonly string[], status: SongStatus) => {
      const updatedAt = Date.now();
      return db.transaction("rw", db.songs, async () => {
        for (const id of songIds) await db.songs.update(id, { status, updatedAt });
      });
    },
    [db],
  );

  const addTag = useCallback(
    (songIds: readonly string[], tag: string) => {
      const updatedAt = Date.now();
      return db.transaction("rw", db.songs, async () => {
        const songs = await db.songs.bulkGet([...songIds]);
        for (const song of songs) {
          const tags = song && withTag(song.tags, tag);
          if (song && tags) await db.songs.update(song.id, { tags, updatedAt });
        }
      });
    },
    [db],
  );

  return { setStatus, addTag };
}
