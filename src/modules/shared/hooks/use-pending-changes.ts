import { useDb } from "@db/provider";
import { useActiveProfileId } from "@domain/profiles";
import { loadSyncConfig } from "@domain/sync/config";
import { countPendingChanges } from "@domain/sync/pending";
import { loadTombstones } from "@domain/sync/tombstones";
import { useLiveQuery } from "dexie-react-hooks";

/** Local changes the next sync sends; undefined until the profile has synced once. */
export function usePendingChanges(): number | undefined {
  const db = useDb();
  const profileId = useActiveProfileId();
  return useLiveQuery(async () => {
    if (!loadSyncConfig(profileId)) return undefined;
    const last = await db._syncState.get("last");
    if (!last) return undefined;
    const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()]);
    return countPendingChanges({ songs, setlists }, last.snapshot, loadTombstones(profileId));
  }, [db, profileId]);
}
