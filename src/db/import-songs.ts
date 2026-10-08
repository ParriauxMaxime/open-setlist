import type { ImportWrites } from "@domain/import/setlist-helper";
import type { AppDatabase } from ".";

/** Add new songs and update matched ones in a single transaction. Never deletes. */
export async function writeImportedSongs(db: AppDatabase, writes: ImportWrites): Promise<void> {
  await db.transaction("rw", db.songs, async () => {
    if (writes.added.length > 0) await db.songs.bulkAdd(writes.added);
    if (writes.updated.length > 0) await db.songs.bulkPut(writes.updated);
  });
}
