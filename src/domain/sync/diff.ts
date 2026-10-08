import type { Setlist } from "@db/setlist";
import type { Snapshot } from "@db/snapshot";
import type { Song } from "@db/song";
import type { Tombstone } from "./tombstones";

export type ItemType = "song" | "setlist";
export type ItemChange = "added" | "modified" | "deleted";

export interface ChangeItem {
  type: ItemType;
  id: string;
  name: string;
  change: ItemChange;
}

export interface ConflictSide {
  deleted: boolean;
  name: string | null;
  /** Last edit time, or deletion time when known. */
  at: number | null;
  /** Content lines for a song, song count for a setlist. */
  size: number | null;
}

/** An item changed both locally and remotely since the last sync. The user must pick a side. */
export interface SyncConflict {
  type: ItemType;
  id: string;
  name: string;
  local: ConflictSide;
  remote: ConflictSide;
  /** Fields that differ between both versions (empty when one side deleted the item). */
  changedFields: string[];
  /** Lines (song) or song ids (setlist) present only in one version. */
  onlyLocal: number;
  onlyRemote: number;
}

export interface SyncDiff {
  /** Remote changes — always applied, not selectable */
  incoming: ChangeItem[];
  /** Local changes — user selects which to push */
  outgoing: ChangeItem[];
  /** Changed on both sides — user must choose "mine" or "theirs" */
  conflicts: SyncConflict[];
}

export type PlanKind = "none" | "incoming" | "outgoing" | "conflict";

/** Three-way classification of one item (baseline = last synced snapshot). */
export interface ItemPlan<T> {
  type: ItemType;
  id: string;
  kind: PlanKind;
  /** Change on the side that moves (remote for incoming, local for outgoing). */
  change: ItemChange | null;
  local?: T;
  remote?: T;
  base?: T;
  localTombstone?: Tombstone;
  remoteTombstone?: Tombstone;
}

export interface SnapshotPlan {
  songs: ItemPlan<Song>[];
  setlists: ItemPlan<Setlist>[];
}

const EMPTY_SNAPSHOT: Snapshot = { version: 2, exportedAt: 0, songs: [], setlists: [] };

export function itemKey(type: ItemType, id: string): string {
  return `${type}:${id}`;
}

export function planSnapshots(
  local: Snapshot,
  lastPushed: Snapshot | null,
  remote: Snapshot,
  localTombstones: Tombstone[],
): SnapshotPlan {
  const base = lastPushed ?? EMPTY_SNAPSHOT;
  const remoteTombstones = remote.tombstones ?? [];
  return {
    songs: planItems(
      "song",
      local.songs,
      base.songs,
      remote.songs,
      localTombstones,
      remoteTombstones,
    ),
    setlists: planItems(
      "setlist",
      local.setlists,
      base.setlists,
      remote.setlists,
      localTombstones,
      remoteTombstones,
    ),
  };
}

/**
 * Compute the diff between local state, last-pushed snapshot, and remote snapshot.
 *
 * - Outgoing = changed locally since last sync, unchanged remotely
 * - Incoming = changed remotely since last sync, unchanged locally
 * - Conflicts = changed on both sides (to different versions)
 */
export function computeDiff(
  local: Snapshot,
  lastPushed: Snapshot | null,
  remote: Snapshot,
  tombstones: Tombstone[],
): SyncDiff {
  const plan = planSnapshots(local, lastPushed, remote, tombstones);
  const all: ItemPlan<Song | Setlist>[] = [...plan.songs, ...plan.setlists];
  const diff: SyncDiff = { incoming: [], outgoing: [], conflicts: [] };

  for (const item of all) {
    if (item.kind === "conflict") {
      diff.conflicts.push(describeConflict(item));
    } else if (item.kind !== "none" && item.change) {
      const target = item.kind === "incoming" ? diff.incoming : diff.outgoing;
      target.push({ type: item.type, id: item.id, name: planName(item), change: item.change });
    }
  }

  return diff;
}

function planItems<T extends { id: string; updatedAt: number }>(
  type: ItemType,
  localItems: T[],
  baseItems: T[],
  remoteItems: T[],
  localTombstones: Tombstone[],
  remoteTombstones: Tombstone[],
): ItemPlan<T>[] {
  const localMap = new Map(localItems.map((item) => [item.id, item]));
  const baseMap = new Map(baseItems.map((item) => [item.id, item]));
  const remoteMap = new Map(remoteItems.map((item) => [item.id, item]));
  const localTombs = new Map(localTombstones.filter((t) => t.type === type).map((t) => [t.id, t]));
  const remoteTombs = new Map(
    remoteTombstones.filter((t) => t.type === type).map((t) => [t.id, t]),
  );
  const ids = new Set([...localMap.keys(), ...baseMap.keys(), ...remoteMap.keys()]);

  const plans: ItemPlan<T>[] = [];
  for (const id of ids) {
    const local = localMap.get(id);
    const base = baseMap.get(id);
    const remote = remoteMap.get(id);
    const localTombstone = localTombs.get(id);
    const remoteTombstone = remoteTombs.get(id);
    const [kind, change] = classify(
      local,
      base,
      remote,
      sideChange(local, base, localTombstone),
      sideChange(remote, base, remoteTombstone),
      localTombstone,
      remoteTombstone,
    );
    plans.push({ type, id, kind, change, local, remote, base, localTombstone, remoteTombstone });
  }
  return plans;
}

function sideChange<T extends { updatedAt: number }>(
  item: T | undefined,
  base: T | undefined,
  tombstone: Tombstone | undefined,
): ItemChange | null {
  if (item && !base) return "added";
  // `!==` rather than `>`: a version older than the baseline (e.g. a "keep mine" push) is still a change.
  if (item && base) return item.updatedAt !== base.updatedAt ? "modified" : null;
  if (base || tombstone) return "deleted";
  return null;
}

function classify<T extends { updatedAt: number }>(
  local: T | undefined,
  base: T | undefined,
  remote: T | undefined,
  localChange: ItemChange | null,
  remoteChange: ItemChange | null,
  localTombstone: Tombstone | undefined,
  remoteTombstone: Tombstone | undefined,
): [PlanKind, ItemChange | null] {
  // Neither side has it (deleted on both sides, or a stale tombstone): nothing to do.
  if (!local && !remote) return ["none", null];
  if (!localChange && !remoteChange) return ["none", null];
  if (localChange && !remoteChange) return ["outgoing", localChange];
  if (remoteChange && !localChange) return ["incoming", remoteChange];

  // Both sides changed since the last sync.
  if (local && remote) {
    return local.updatedAt === remote.updatedAt ? ["none", null] : ["conflict", null];
  }
  // Without a baseline (never synced this item) only timestamps can tell: a deletion
  // that happened after the other side's last edit wins. Otherwise the user decides.
  if (local && !base && remoteTombstone && remoteTombstone.deletedAt >= local.updatedAt) {
    return ["incoming", "deleted"];
  }
  if (remote && !base && localTombstone && localTombstone.deletedAt >= remote.updatedAt) {
    return ["outgoing", "deleted"];
  }
  return ["conflict", null];
}

function getName(item: { id: string } | undefined): string | null {
  if (!item) return null;
  if ("title" in item && typeof item.title === "string") return item.title;
  if ("name" in item && typeof item.name === "string") return item.name;
  return null;
}

function planName(plan: ItemPlan<Song | Setlist>): string {
  return getName(plan.local) ?? getName(plan.remote) ?? getName(plan.base) ?? plan.id;
}

function contentUnits(item: Song | Setlist): string[] {
  if ("content" in item) return item.content.split("\n");
  return item.sets.flatMap((set) => set.songIds);
}

function describeSide(item: Song | Setlist | undefined, tombstone?: Tombstone): ConflictSide {
  if (!item) return { deleted: true, name: null, at: tombstone?.deletedAt ?? null, size: null };
  return {
    deleted: false,
    name: getName(item),
    at: item.updatedAt,
    size: contentUnits(item).length,
  };
}

/** Count entries of `a` not matched in `b` (multiset difference). */
function countOnlyIn(a: string[], b: string[]): number {
  const remaining = new Map<string, number>();
  for (const unit of b) remaining.set(unit, (remaining.get(unit) ?? 0) + 1);
  let count = 0;
  for (const unit of a) {
    const left = remaining.get(unit) ?? 0;
    if (left > 0) remaining.set(unit, left - 1);
    else count++;
  }
  return count;
}

const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

function describeConflict(plan: ItemPlan<Song | Setlist>): SyncConflict {
  const { local, remote } = plan;
  let changedFields: string[] = [];
  let onlyLocal = 0;
  let onlyRemote = 0;
  if (local && remote) {
    const l = local as unknown as Record<string, unknown>;
    const r = remote as unknown as Record<string, unknown>;
    const fields = new Set([...Object.keys(l), ...Object.keys(r)]);
    changedFields = [...fields].filter(
      (field) =>
        !IGNORED_FIELDS.has(field) && JSON.stringify(l[field]) !== JSON.stringify(r[field]),
    );
    onlyLocal = countOnlyIn(contentUnits(local), contentUnits(remote));
    onlyRemote = countOnlyIn(contentUnits(remote), contentUnits(local));
  }
  return {
    type: plan.type,
    id: plan.id,
    name: planName(plan),
    local: describeSide(local, plan.localTombstone),
    remote: describeSide(remote, plan.remoteTombstone),
    changedFields,
    onlyLocal,
    onlyRemote,
  };
}
