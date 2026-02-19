import { exportSnapshot, importSnapshot, SNAPSHOT_VERSION } from "@db/snapshot";
import { loadSyncConfig, saveSyncConfig } from "./config";
import { mergeSnapshots } from "./merge";
import { ConflictError, type RemoteSyncPort } from "./ports/remote-sync.port";
import { loadTombstones, pruneTombstones, saveTombstones } from "./tombstones";

export interface SyncResult {
  status: "created" | "synced" | "up-to-date";
  songCount: number;
  setlistCount: number;
}

export async function sync(adapter: RemoteSyncPort): Promise<SyncResult> {
  const attempt = async (): Promise<SyncResult> => {
    const remoteResult = await adapter.pull();
    const local = await exportSnapshot();

    // First sync — no remote file yet
    if (!remoteResult) {
      const newToken = await adapter.push(local, null);
      updateConfig(newToken);
      return {
        status: "created",
        songCount: local.songs.length,
        setlistCount: local.setlists.length,
      };
    }

    const { snapshot: remote, versionToken } = remoteResult;
    const tombstones = loadTombstones();
    const merged = mergeSnapshots(local, remote, tombstones);

    const mergedSnapshot = {
      version: SNAPSHOT_VERSION,
      exportedAt: Date.now(),
      songs: merged.songs,
      setlists: merged.setlists,
    };

    await importSnapshot(mergedSnapshot);
    const newToken = await adapter.push(mergedSnapshot, versionToken);
    updateConfig(newToken);

    // Prune and save tombstones
    saveTombstones(pruneTombstones(tombstones));

    return {
      status: "synced",
      songCount: merged.songs.length,
      setlistCount: merged.setlists.length,
    };
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof ConflictError) {
      // Retry once on conflict
      return await attempt();
    }
    throw err;
  }
}

function updateConfig(newToken: string): void {
  const config = loadSyncConfig();
  if (config) {
    saveSyncConfig({ ...config, lastVersionToken: newToken, lastSyncedAt: Date.now() });
  }
}
