import type { AppDatabase } from "@db";
import { exportSnapshot, importSnapshot, SNAPSHOT_VERSION, type Snapshot } from "@db/snapshot";
import { loadSyncConfig, saveSyncConfig } from "./config";
import { type ChangeItem, computeDiff, type SyncDiff } from "./diff";
import { mergeSnapshots } from "./merge";
import { ConflictError, type RemoteSyncPort } from "./ports/remote-sync.port";
import { loadTombstones, pruneTombstones, saveTombstones } from "./tombstones";

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
  if (diff.incoming.length === 0 && diff.outgoing.length === 0) {
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

export async function pushSelected(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
  ctx: SyncReviewContext,
  selectedOutgoing: ChangeItem[],
): Promise<SyncResult> {
  const attempt = async (): Promise<SyncResult> => {
    const tombstones = loadTombstones(profileId);

    // 1. Apply all incoming changes to local DB
    if (ctx.diff.incoming.length > 0) {
      const merged = mergeSnapshots(ctx.local, ctx.remote, tombstones);
      const mergedSnapshot: Snapshot = {
        version: SNAPSHOT_VERSION,
        exportedAt: Date.now(),
        songs: merged.songs,
        setlists: merged.setlists,
      };
      await importSnapshot(db, mergedSnapshot);
    }

    // 2. Build push snapshot from baseline + selected outgoing changes
    const pushSnapshot = buildPushSnapshot(ctx, selectedOutgoing);

    // 3. Push to remote
    const newToken = await adapter.push(pushSnapshot, ctx.versionToken);
    updateConfig(profileId, newToken);

    // 4. Save the pushed snapshot as the new baseline
    await saveSyncState(db, pushSnapshot);

    // 5. Prune tombstones
    saveTombstones(profileId, pruneTombstones(tombstones));

    return {
      status: "synced",
      songCount: pushSnapshot.songs.length,
      setlistCount: pushSnapshot.setlists.length,
    };
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof ConflictError) {
      return await attempt();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Legacy full sync (kept for file import/export which doesn't need review)
// ---------------------------------------------------------------------------

export async function sync(
  adapter: RemoteSyncPort,
  db: AppDatabase,
  profileId: string,
): Promise<SyncResult> {
  const result = await pullAndDiff(adapter, db, profileId);

  // If it's already a final result (created / up-to-date), return it
  if ("status" in result) return result;

  // Auto-select all outgoing changes
  return pushSelected(adapter, db, profileId, result, result.diff.outgoing);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPushSnapshot(ctx: SyncReviewContext, selected: ChangeItem[]): Snapshot {
  const baseline = ctx.lastPushed ?? {
    songs: [],
    setlists: [],
    version: SNAPSHOT_VERSION,
    exportedAt: 0,
  };
  const selectedIds = new Set(selected.map((c) => `${c.type}:${c.id}`));

  // Start from the merged state (baseline + incoming)
  // Then apply selected outgoing changes
  const localSongMap = new Map(ctx.local.songs.map((s) => [s.id, s]));
  const localSetlistMap = new Map(ctx.local.setlists.map((s) => [s.id, s]));
  const baselineSongMap = new Map(baseline.songs.map((s) => [s.id, s]));
  const baselineSetlistMap = new Map(baseline.setlists.map((s) => [s.id, s]));

  // Start with remote as the base (incoming changes already incorporated)
  const songs = new Map(ctx.remote.songs.map((s) => [s.id, s]));
  const setlists = new Map(ctx.remote.setlists.map((s) => [s.id, s]));

  // Apply selected outgoing song changes
  for (const change of ctx.diff.outgoing) {
    const key = `${change.type}:${change.id}`;
    if (!selectedIds.has(key)) continue;

    if (change.type === "song") {
      if (change.change === "added" || change.change === "modified") {
        const local = localSongMap.get(change.id);
        if (local) songs.set(change.id, local);
      } else if (change.change === "deleted") {
        songs.delete(change.id);
      }
    } else {
      if (change.change === "added" || change.change === "modified") {
        const local = localSetlistMap.get(change.id);
        if (local) setlists.set(change.id, local);
      } else if (change.change === "deleted") {
        setlists.delete(change.id);
      }
    }
  }

  // For deselected outgoing changes, keep the baseline version in the push
  for (const change of ctx.diff.outgoing) {
    const key = `${change.type}:${change.id}`;
    if (selectedIds.has(key)) continue;

    if (change.type === "song") {
      if (change.change === "added") {
        // Not selected → don't include the new song in push
        // (remote already doesn't have it, so nothing to do)
      } else if (change.change === "modified") {
        // Revert to baseline version in the push
        const base = baselineSongMap.get(change.id);
        if (base) songs.set(change.id, base);
      } else if (change.change === "deleted") {
        // Re-include the baseline version (don't delete from push)
        const base = baselineSongMap.get(change.id);
        if (base) songs.set(change.id, base);
      }
    } else {
      if (change.change === "modified") {
        const base = baselineSetlistMap.get(change.id);
        if (base) setlists.set(change.id, base);
      } else if (change.change === "deleted") {
        const base = baselineSetlistMap.get(change.id);
        if (base) setlists.set(change.id, base);
      }
    }
  }

  return {
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    songs: Array.from(songs.values()),
    setlists: Array.from(setlists.values()),
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
