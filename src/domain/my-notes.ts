/**
 * "My notes": a musician's private per-song reminders ("capo 2 here", "watch the singer").
 *
 * Kept in localStorage, keyed by profile, never in the profile's Dexie database: sync
 * snapshots and band exports only read the database, so these notes can't leak into the
 * shared charts.
 */

export interface MyNote {
  text: string;
  updatedAt: number;
}

/** Song id → note. */
export type MyNotesMap = Record<string, MyNote>;

export const MY_NOTE_MAX_LENGTH = 2000;

const STORAGE_KEY_PREFIX = "open-setlist-my-notes";

export function myNotesStorageKey(profileId: string): string {
  return `${STORAGE_KEY_PREFIX}-${profileId}`;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Unifies line endings, trims surrounding blank space and caps the length. */
export function normalizeNoteText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim().slice(0, MY_NOTE_MAX_LENGTH);
}

/** Copy of `notes` with the song's note set, or removed when the text is blank. */
export function withMyNote(
  notes: MyNotesMap,
  songId: string,
  text: string,
  now = Date.now(),
): MyNotesMap {
  const next = { ...notes };
  const clean = normalizeNoteText(text);
  if (clean) next[songId] = { text: clean, updatedAt: now };
  else delete next[songId];
  return next;
}

/** Keeps only well-formed, non-blank notes (stored data or an imported file may be off). */
export function parseMyNotes(raw: unknown): MyNotesMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const notes: MyNotesMap = {};
  for (const [songId, value] of Object.entries(raw)) {
    // Never a song id, and assigning it would replace the map's prototype
    if (songId === "__proto__" || !value || typeof value !== "object") continue;
    const { text, updatedAt } = value as Partial<MyNote>;
    if (typeof text !== "string") continue;
    const clean = normalizeNoteText(text);
    if (!clean) continue;
    notes[songId] = {
      text: clean,
      updatedAt: typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0,
    };
  }
  return notes;
}

/** Union of two note sets; for a song in both, the most recently edited note wins. */
export function mergeMyNotes(current: MyNotesMap, incoming: MyNotesMap): MyNotesMap {
  const merged = { ...current };
  for (const [songId, note] of Object.entries(incoming)) {
    const existing = merged[songId];
    if (!existing || note.updatedAt > existing.updatedAt) merged[songId] = note;
  }
  return merged;
}

export function parseStoredMyNotes(raw: string | null): MyNotesMap {
  if (!raw) return {};
  try {
    return parseMyNotes(JSON.parse(raw));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Persistence (localStorage, per profile)
// ---------------------------------------------------------------------------

let listeners: Array<() => void> = [];

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

/** Called after any write made through this module (for useSyncExternalStore). */
export function subscribeMyNotes(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function readStoredMyNotes(profileId: string): string | null {
  return localStorage.getItem(myNotesStorageKey(profileId));
}

export function loadMyNotes(profileId: string): MyNotesMap {
  return parseStoredMyNotes(readStoredMyNotes(profileId));
}

export function saveMyNotes(profileId: string, notes: MyNotesMap): void {
  const key = myNotesStorageKey(profileId);
  if (Object.keys(notes).length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(notes));
  notifyListeners();
}

export function getMyNote(profileId: string, songId: string): string {
  return loadMyNotes(profileId)[songId]?.text ?? "";
}

/** Saves the song's note; a blank text deletes it. */
export function setMyNote(profileId: string, songId: string, text: string): void {
  saveMyNotes(profileId, withMyNote(loadMyNotes(profileId), songId, text));
}

export function removeMyNote(profileId: string, songId: string): void {
  const notes = loadMyNotes(profileId);
  if (!Object.hasOwn(notes, songId)) return;
  delete notes[songId];
  saveMyNotes(profileId, notes);
}

export function clearMyNotes(profileId: string): void {
  localStorage.removeItem(myNotesStorageKey(profileId));
  notifyListeners();
}
