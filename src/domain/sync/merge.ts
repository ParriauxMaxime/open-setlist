import type { Setlist } from "@db/setlist";
import type { Snapshot } from "@db/snapshot";
import type { Song } from "@db/song";
import type { Tombstone } from "./tombstones";

export interface MergeResult {
  songs: Song[];
  setlists: Setlist[];
}

export function mergeSnapshots(
  local: Snapshot,
  remote: Snapshot,
  localTombstones: Tombstone[],
): MergeResult {
  return {
    songs: mergeItems(local.songs, remote.songs, localTombstones, "song"),
    setlists: mergeItems(local.setlists, remote.setlists, localTombstones, "setlist"),
  };
}

function mergeItems<T extends { id: string; updatedAt: number }>(
  localItems: T[],
  remoteItems: T[],
  tombstones: Tombstone[],
  type: Tombstone["type"],
): T[] {
  const tombstoneMap = new Map(
    tombstones.filter((t) => t.type === type).map((t) => [t.id, t.deletedAt]),
  );

  const merged = new Map<string, T>();

  // Start with local items
  for (const item of localItems) {
    merged.set(item.id, item);
  }

  // Merge remote items
  for (const item of remoteItems) {
    const localItem = merged.get(item.id);
    const tombDeletedAt = tombstoneMap.get(item.id);

    // If locally tombstoned with a newer timestamp, skip this remote item
    if (tombDeletedAt !== undefined && tombDeletedAt >= item.updatedAt) {
      continue;
    }

    if (!localItem) {
      // Remote-only item, not locally tombstoned (or tombstone is older) — add it
      merged.set(item.id, item);
    } else if (item.updatedAt > localItem.updatedAt) {
      // Remote is newer — take remote version
      merged.set(item.id, item);
    }
    // Otherwise keep local (local is same age or newer)
  }

  return Array.from(merged.values());
}
