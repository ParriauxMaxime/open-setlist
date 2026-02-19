import type { Snapshot } from "@db/snapshot";
import type { Tombstone } from "./tombstones";

export interface ChangeItem {
  type: "song" | "setlist";
  id: string;
  name: string;
  change: "added" | "modified" | "deleted";
}

export interface SyncDiff {
  /** Remote changes — always applied, not selectable */
  incoming: ChangeItem[];
  /** Local changes — user selects which to push */
  outgoing: ChangeItem[];
}

/**
 * Compute the diff between local state, last-pushed snapshot, and remote snapshot.
 *
 * - Outgoing = local vs last-pushed (what the user changed since last sync)
 * - Incoming = remote vs last-pushed (what others changed since last sync)
 */
export function computeDiff(
  local: Snapshot,
  lastPushed: Snapshot | null,
  remote: Snapshot,
  tombstones: Tombstone[],
): SyncDiff {
  // If no last-pushed snapshot, treat everything as a first sync
  // — all local items are "outgoing added", all remote-only items are "incoming added"
  const baseline = lastPushed ?? { songs: [], setlists: [], version: 0, exportedAt: 0 };

  const outgoing = [
    ...diffItems("song", local.songs, baseline.songs, tombstones),
    ...diffItems("setlist", local.setlists, baseline.setlists, tombstones),
  ];

  const incoming = [
    ...diffItems("song", remote.songs, baseline.songs, remoteTombstones(remote, baseline)),
    ...diffItems("setlist", remote.setlists, baseline.setlists, remoteTombstones(remote, baseline)),
  ];

  return { incoming, outgoing };
}

/** Infer remote deletions: items in baseline but not in remote snapshot */
function remoteTombstones(remote: Snapshot, baseline: Snapshot): Tombstone[] {
  const remoteSongIds = new Set(remote.songs.map((s) => s.id));
  const remoteSetlistIds = new Set(remote.setlists.map((s) => s.id));
  const tombstones: Tombstone[] = [];

  for (const song of baseline.songs) {
    if (!remoteSongIds.has(song.id)) {
      tombstones.push({ type: "song", id: song.id, deletedAt: Date.now() });
    }
  }
  for (const setlist of baseline.setlists) {
    if (!remoteSetlistIds.has(setlist.id)) {
      tombstones.push({ type: "setlist", id: setlist.id, deletedAt: Date.now() });
    }
  }

  return tombstones;
}

function diffItems<T extends { id: string; updatedAt: number }>(
  type: "song" | "setlist",
  current: T[],
  baseline: T[],
  tombstones: Tombstone[],
): ChangeItem[] {
  const baselineMap = new Map(baseline.map((item) => [item.id, item]));
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const tombstoneIds = new Set(tombstones.filter((t) => t.type === type).map((t) => t.id));
  const changes: ChangeItem[] = [];

  // Added or modified
  for (const item of current) {
    const base = baselineMap.get(item.id);
    const name = getName(item);
    if (!base) {
      changes.push({ type, id: item.id, name, change: "added" });
    } else if (item.updatedAt > base.updatedAt) {
      changes.push({ type, id: item.id, name, change: "modified" });
    }
  }

  // Deleted (in baseline but tombstoned or missing from current)
  for (const base of baseline) {
    if (!currentMap.has(base.id) || tombstoneIds.has(base.id)) {
      const name = getName(base);
      changes.push({ type, id: base.id, name, change: "deleted" });
    }
  }

  return changes;
}

function getName(item: { id: string; [key: string]: unknown }): string {
  if (typeof item.title === "string") return item.title;
  if (typeof item.name === "string") return item.name;
  return item.id;
}
