const STORAGE_KEY = "open-setlist-tombstones";
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Tombstone {
  type: "song" | "setlist";
  id: string;
  deletedAt: number;
}

export function loadTombstones(): Tombstone[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTombstones(tombstones: Tombstone[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tombstones));
}

export function addTombstone(type: Tombstone["type"], id: string): void {
  const tombstones = loadTombstones();
  // Avoid duplicates
  if (tombstones.some((t) => t.type === type && t.id === id)) return;
  tombstones.push({ type, id, deletedAt: Date.now() });
  saveTombstones(tombstones);
}

export function pruneTombstones(tombstones: Tombstone[]): Tombstone[] {
  const cutoff = Date.now() - PRUNE_AGE_MS;
  return tombstones.filter((t) => t.deletedAt > cutoff);
}
