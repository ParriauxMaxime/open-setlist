import type { AppDatabase } from "@db";
import { exportSnapshot, importSnapshot, SNAPSHOT_VERSION, type Snapshot } from "@db/snapshot";
import { loadSyncConfig, saveSyncConfig } from "./config";
import {
  type ChangeItem,
  computeDiff,
  type ItemPlan,
  itemKey,
  planSnapshots,
  type SyncDiff,
} from "./diff";
import { type ConflictResolutions, mergeSnapshots } from "./merge";
import { ConflictError, type RemoteSyncPort } from "./ports/remote-sync.port";
import { loadTombstones, mergeTombstones, pruneTombstones, type Tombstone } from "./tombstones";

/** Re-pull + retry attempts after the remote moved between our pull and our push. */
const MAX_CONFLICT_RETRIES = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  status: "created" | "synced" | "up-to-date";
  songCount: number;
  setlistCount: number;
}

/** Returned by pullAndDiff — everything the UI needs to show the review screen */
export interface SyncReviewContext {
  diff: SyncDiff;
  /** The remote snapshot we pulled */
  remote: Snapshot;
  /** Remote version token for push */
  versionToken: string;
  /** The local snapshot at the time of pull */
  local: Snapshot;
  /** The last-pushed snapshot (baseline), or null for first sync */
  lastPushed: Snapshot | null;
}

/**
 * The sync cannot proceed without a (new) user decision: unresolved conflicts, or the remote
 * changed an item the user reviewed while we were pushing. Nothing was written. `ctx` is the
 * fresh review context to show.
 */
export class SyncReviewRequiredError extends Error {
  constructor(readonly ctx: SyncReviewContext) {
    super("Remote changes need review before syncing");
    this.name = "SyncReviewRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Pull + Diff (step 1 of the two-step flow)
// ---------------------------------------------------------------------------

export async function pullAndDiff(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
): Promise<SyncReviewContext | SyncResult> {
  const remoteResult = await adapter.pull();
  const local = await exportSnapshot(db, profileId);
  const lastPushedRow = await db._syncState.get("last");
  const lastPushed = lastPushedRow?.snapshot ?? null;

  // First sync — no remote file yet. Push everything immediately.
  if (!remoteResult) {
    const newToken = await adapter.push(local, null);
    updateConfig(profileId, newToken);
    await saveSyncState(db, local);
    return {
      status: "created",
      songCount: local.songs.length,
      setlistCount: local.setlists.length,
    };
  }

  const { snapshot: remote, versionToken } = remoteResult;
  const tombstones = loadTombstones(profileId);
  const diff = computeDiff(local, lastPushed, remote, tombstones);

  // Nothing changed either way
  if (diff.incoming.length === 0 && diff.outgoing.length === 0 && diff.conflicts.length === 0) {
    return {
      status: "up-to-date",
      songCount: local.songs.length,
      setlistCount: local.setlists.length,
    };
  }

  return { diff, remote, versionToken, local, lastPushed };
}

// ---------------------------------------------------------------------------
// Push Selected (step 2 of the two-step flow)
// ---------------------------------------------------------------------------

/**
 * Apply incoming changes locally and push the selected outgoing changes plus conflicts resolved
 * as "mine". Every conflict in `ctx.diff.conflicts` must have a resolution.
 *
 * If the remote moved since `ctx` was pulled, re-pulls and rebuilds the push on top of the fresh
 * remote. If the fresh remote touched an item the user decided on, or created a new conflict,
 * throws SyncReviewRequiredError instead of overwriting. Same if local data changed (e.g. another
 * tab) since the review: the local import below would otherwise erase those edits.
 */
export async function pushSelected(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
  ctx: SyncReviewContext,
  selectedOutgoing: ChangeItem[],
  resolutions: ConflictResolutions = {},
): Promise<SyncResult> {
  const selected = new Set(selectedOutgoing.map((c) => itemKey(c.type, c.id)));
  let current = ctx;

  const localNow = await exportSnapshot(db, profileId);
  if (versionsDiffer(ctx.local, localNow)) {
    const tombstones = localNow.tombstones ?? [];
    const diff = computeDiff(localNow, ctx.lastPushed, ctx.remote, tombstones);
    throw new SyncReviewRequiredError({ ...ctx, local: localNow, diff });
  }

  for (let retry = 0; ; retry++) {
    if (current.diff.conflicts.some((c) => !resolutions[itemKey(c.type, c.id)])) {
      throw new SyncReviewRequiredError(current);
    }
    try {
      return await commit(adapter, db, profileId, current, selected, resolutions);
    } catch (err) {
      if (!(err instanceof ConflictError) || retry >= MAX_CONFLICT_RETRIES) throw err;
      current = await rebaseOnFreshRemote(adapter, current, selected, resolutions);
    }
  }
}

async function commit(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
  ctx: SyncReviewContext,
  selected: Set<string>,
  resolutions: ConflictResolutions,
): Promise<SyncResult> {
  const localTombstones = ctx.local.tombstones ?? [];
  const merged = mergeSnapshots(ctx.local, ctx.remote, localTombstones, {
    base: ctx.lastPushed,
    resolutions,
  });
  const pushSnapshot = buildPushSnapshot(ctx, selected, resolutions);

  // Push first: on conflict nothing local has been touched yet.
  let token = ctx.versionToken;
  if (pushSnapshot) {
    token = await adapter.push(pushSnapshot, ctx.versionToken);
  }

  await importSnapshot(
    db,
    {
      version: SNAPSHOT_VERSION,
      exportedAt: Date.now(),
      songs: merged.songs,
      setlists: merged.setlists,
      tombstones: merged.tombstones,
    },
    profileId,
  );

  // The new baseline is what the remote now holds.
  const baseline = pushSnapshot ?? ctx.remote;
  updateConfig(profileId, token);
  await saveSyncState(db, baseline);

  return {
    status: "synced",
    songCount: baseline.songs.length,
    setlistCount: baseline.setlists.length,
  };
}

async function rebaseOnFreshRemote(
  adapter: RemoteSyncPort,
  ctx: SyncReviewContext,
  selected: Set<string>,
  resolutions: ConflictResolutions,
): Promise<SyncReviewContext> {
  const fresh = await adapter.pull();
  if (!fresh) throw new Error("Remote sync file disappeared during sync");

  const diff = computeDiff(ctx.local, ctx.lastPushed, fresh.snapshot, ctx.local.tombstones ?? []);
  const next: SyncReviewContext = {
    ...ctx,
    diff,
    remote: fresh.snapshot,
    versionToken: fresh.versionToken,
  };

  // Items the user decided on must still look the way they did on the review screen.
  const before = versionMap(ctx.remote);
  const after = versionMap(fresh.snapshot);
  const decided = [...selected, ...Object.keys(resolutions)];
  const moved = decided.some((key) => before.get(key) !== after.get(key));
  const unresolved = diff.conflicts.some((c) => !resolutions[itemKey(c.type, c.id)]);
  if (moved || unresolved) throw new SyncReviewRequiredError(next);
  return next;
}

/** `updatedAt` per item key. */
function versionMap(snapshot: Snapshot): Map<string, number> {
  return new Map([
    ...snapshot.songs.map((s) => [itemKey("song", s.id), s.updatedAt] as const),
    ...snapshot.setlists.map((s) => [itemKey("setlist", s.id), s.updatedAt] as const),
  ]);
}

function versionsDiffer(a: Snapshot, b: Snapshot): boolean {
  const left = versionMap(a);
  const right = versionMap(b);
  if (left.size !== right.size) return true;
  for (const [key, updatedAt] of left) {
    if (right.get(key) !== updatedAt) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Legacy full sync (used by invite join, which has no review screen)
// ---------------------------------------------------------------------------

export async function sync(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
): Promise<SyncResult> {
  const result = await pullAndDiff(adapter, db, profileId);

  // If it's already a final result (created / up-to-date), return it
  if ("status" in result) return result;

  // Auto-select all outgoing changes. Conflicts need a human: pushSelected throws
  // SyncReviewRequiredError without resolutions, before writing anything.
  return pushSelected(adapter, db, profileId, result, result.diff.outgoing);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remote snapshot + selected outgoing changes + conflicts resolved as "mine".
 * Everything else keeps its remote version. Returns null when there is nothing to push.
 */
function buildPushSnapshot(
  ctx: SyncReviewContext,
  selected: Set<string>,
  resolutions: ConflictResolutions,
): Snapshot | null {
  const plan = planSnapshots(ctx.local, ctx.lastPushed, ctx.remote, ctx.local.tombstones ?? []);
  const pushedDeletions: Tombstone[] = [];
  let changed = false;

  function apply<T extends { id: string }>(plans: ItemPlan<T>[], items: T[]): T[] {
    const map = new Map(items.map((item) => [item.id, item]));
    for (const item of plans) {
      const key = itemKey(item.type, item.id);
      const pushLocal =
        (item.kind === "outgoing" && selected.has(key)) ||
        (item.kind === "conflict" && resolutions[key] === "mine");
      if (!pushLocal) continue;
      changed = true;
      if (item.local) {
        map.set(item.id, item.local);
      } else {
        map.delete(item.id);
        pushedDeletions.push(
          item.localTombstone ?? { type: item.type, id: item.id, deletedAt: Date.now() },
        );
      }
    }
    return Array.from(map.values());
  }

  const songs = apply(plan.songs, ctx.remote.songs);
  const setlists = apply(plan.setlists, ctx.remote.setlists);
  if (!changed) return null;

  const present = new Set([
    ...songs.map((s) => itemKey("song", s.id)),
    ...setlists.map((s) => itemKey("setlist", s.id)),
  ]);
  const tombstones = pruneTombstones(
    mergeTombstones(ctx.remote.tombstones ?? [], pushedDeletions),
  ).filter((t) => !present.has(itemKey(t.type, t.id)));

  return {
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    songs,
    setlists,
    ...(tombstones.length > 0 ? { tombstones } : {}),
  };
}

function updateConfig(profileId: string, newToken: string): void {
  const config = loadSyncConfig(profileId);
  if (config) {
    saveSyncConfig(profileId, { ...config, lastVersionToken: newToken, lastSyncedAt: Date.now() });
  }
}

async function saveSyncState(db: AppDatabase, snapshot: Snapshot): Promise<void> {
  await db._syncState.put({ key: "last", snapshot, pushedAt: Date.now() });
}
