const STORAGE_KEY_PREFIX = "open-setlist-tombstones";
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function storageKey(profileId: string): string {
  return `${STORAGE_KEY_PREFIX}-${profileId}`;
}

export interface Tombstone {
  type: "song" | "setlist";
  id: string;
  deletedAt: number;
}

export function loadTombstones(profileId: string): Tombstone[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTombstones(profileId: string, tombstones: Tombstone[]): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(tombstones));
}

export function addTombstone(profileId: string, type: Tombstone["type"], id: string): void {
  const tombstones = loadTombstones(profileId);
  if (tombstones.some((t) => t.type === type && t.id === id)) return;
  tombstones.push({ type, id, deletedAt: Date.now() });
  saveTombstones(profileId, tombstones);
}

export function pruneTombstones(tombstones: Tombstone[]): Tombstone[] {
  const cutoff = Date.now() - PRUNE_AGE_MS;
  return tombstones.filter((t) => t.deletedAt > cutoff);
}

/** Migrate old un-keyed tombstones to a profile-keyed one. Returns true if migration happened. */
export function migrateUnkeyedTombstones(profileId: string): boolean {
  const OLD_KEY = "open-setlist-tombstones";
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) return false;
  localStorage.setItem(storageKey(profileId), raw);
  localStorage.removeItem(OLD_KEY);
  return true;
}
