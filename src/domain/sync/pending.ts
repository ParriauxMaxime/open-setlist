import type { Snapshot } from "@db/snapshot";
import { computeDiff } from "./diff";
import type { Tombstone } from "./tombstones";

/**
 * Songs and setlists added, edited or deleted on this device since the last sync: what the
 * next sync sends, provided the band changed none of them meanwhile.
 */
export function countPendingChanges(
  local: Pick<Snapshot, "songs" | "setlists">,
  lastSynced: Snapshot,
  tombstones: Tombstone[],
): number {
  const snapshot: Snapshot = { ...lastSynced, songs: local.songs, setlists: local.setlists };
  return computeDiff(snapshot, lastSynced, lastSynced, tombstones).outgoing.length;
}
