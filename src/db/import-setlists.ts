import {
  buildSetlistImportWrites,
  type SetlistImportFile,
  type SetlistImportWrites,
  type UnmatchedAction,
} from "@domain/import/setlist-helper-setlist";
import type { AppDatabase } from ".";

/**
 * Create one setlist per file (plus stub songs) in a single transaction.
 * Matching and name collisions are resolved against the DB state inside the transaction.
 */
export async function importSetlists(
  db: AppDatabase,
  files: SetlistImportFile[],
  action: UnmatchedAction,
  createId: () => string,
): Promise<SetlistImportWrites> {
  return db.transaction("rw", db.songs, db.setlists, async () => {
    const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()]);
    const writes = buildSetlistImportWrites(files, songs, setlists, action, Date.now(), createId);
    if (writes.songs.length > 0) await db.songs.bulkAdd(writes.songs);
    if (writes.setlists.length > 0) await db.setlists.bulkAdd(writes.setlists);
    return writes;
  });
}
