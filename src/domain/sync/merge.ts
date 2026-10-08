import type { Setlist } from "@db/setlist";
import type { Snapshot } from "@db/snapshot";
import type { Song } from "@db/song";
import { type ItemPlan, itemKey, planSnapshots } from "./diff";
import { mergeTombstones, type Tombstone } from "./tombstones";

export type ConflictResolution = "mine" | "theirs";
/** Keyed by `itemKey(type, id)`. */
export type ConflictResolutions = Record<string, ConflictResolution>;

export interface MergeOptions {
  /** Last synced snapshot. Without it, every item is treated as new on both sides. */
  base?: Snapshot | null;
  resolutions?: ConflictResolutions;
}

export interface MergeResult {
  songs: Song[];
  setlists: Setlist[];
  /** Local + remote tombstones for items absent from the merged result. */
  tombstones: Tombstone[];
  /** Conflict keys with no resolution. Their local version is kept. */
  unresolved: string[];
}

/**
 * Three-way merge of the remote snapshot into local state.
 * Remote changes (including deletions) apply to items unchanged locally; items changed on
 * both sides follow `resolutions`, and keep the local version when unresolved.
 */
export function mergeSnapshots(
  local: Snapshot,
  remote: Snapshot,
  localTombstones: Tombstone[],
  options: MergeOptions = {},
): MergeResult {
  const resolutions = options.resolutions ?? {};
  const plan = planSnapshots(local, options.base ?? null, remote, localTombstones);
  const unresolved: string[] = [];
  const songs = mergeItems(plan.songs, resolutions, unresolved);
  const setlists = mergeItems(plan.setlists, resolutions, unresolved);
  const present = new Set([
    ...songs.map((s) => itemKey("song", s.id)),
    ...setlists.map((s) => itemKey("setlist", s.id)),
  ]);
  const tombstones = mergeTombstones(localTombstones, remote.tombstones ?? []).filter(
    (t) => !present.has(itemKey(t.type, t.id)),
  );
  return { songs, setlists, tombstones, unresolved };
}

function mergeItems<T>(
  plans: ItemPlan<T>[],
  resolutions: ConflictResolutions,
  unresolved: string[],
): T[] {
  const merged: T[] = [];
  for (const plan of plans) {
    let takeRemote = plan.kind === "incoming";
    if (plan.kind === "conflict") {
      const resolution = resolutions[itemKey(plan.type, plan.id)];
      if (!resolution) unresolved.push(itemKey(plan.type, plan.id));
      takeRemote = resolution === "theirs";
    }
    const item = takeRemote ? plan.remote : plan.local;
    if (item) merged.push(item);
  }
  return merged;
}
