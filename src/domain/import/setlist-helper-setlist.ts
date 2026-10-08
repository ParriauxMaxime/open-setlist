/**
 * Import Setlist Helper setlist exports (`/Setlist/ExportCsv?setListId=N`, one file per setlist).
 *
 * Same columns as the catalog export plus `SequenceNumber`; `Lyrics` is empty and the file
 * carries no setlist name, date, venue or set breaks. Pure: the caller writes to the DB.
 */

import type { Setlist } from "@db/setlist";
import type { Song } from "@db/song";
import {
  IMPORT_WARNING_CODES,
  type ImportedSongFields,
  type ImportWarning,
  mapSetlistHelperRecord,
  readSetlistHelperRecords,
  SEQUENCE_COLUMN,
  songMatchKey,
} from "./setlist-helper";

/** Same name the setlist editor gives the first set of a new setlist. */
export const FIRST_SET_NAME = "Set 1";

const REQUIRED_COLUMNS = [SEQUENCE_COLUMN, "Name"] as const;

export interface SetlistEntry {
  /** 1-based data row number in the CSV (header excluded). */
  row: number;
  song: ImportedSongFields;
}

export interface ParsedSetlistFile {
  /** In `SequenceNumber` order, deduplicated by title+artist. */
  entries: SetlistEntry[];
  warnings: ImportWarning[];
}

/** Parse one Setlist Helper setlist CSV (raw bytes or already-decoded text). */
export function parseSetlistHelperSetlistCsv(input: Uint8Array | string): ParsedSetlistFile {
  const { records } = readSetlistHelperRecords(input, REQUIRED_COLUMNS);
  const warnings: ImportWarning[] = [];
  const sequenced: (SetlistEntry & { sequence: number })[] = [];

  records.forEach((record, index) => {
    const row = index + 1;
    const imported = mapSetlistHelperRecord(record, row, warnings);
    if (!imported) return;
    const raw = record[SEQUENCE_COLUMN].trim();
    let sequence = Number(raw);
    if (raw === "" || !Number.isFinite(sequence)) {
      warnings.push({
        row,
        code: IMPORT_WARNING_CODES.invalidSequence,
        title: imported.song.title,
        value: raw,
      });
      sequence = Number.POSITIVE_INFINITY;
    }
    sequenced.push({ row, sequence, song: imported.song });
  });

  // Rows without a valid sequence go last, in file order (Infinity - Infinity is NaN → row).
  sequenced.sort((a, b) => a.sequence - b.sequence || a.row - b.row);

  const entries: SetlistEntry[] = [];
  const seen = new Set<string>();
  for (const { row, song } of sequenced) {
    const key = songMatchKey(song.title, song.artist);
    if (seen.has(key)) {
      warnings.push({ row, code: IMPORT_WARNING_CODES.duplicateInFile, title: song.title });
      continue;
    }
    seen.add(key);
    entries.push({ row, song });
  }

  warnings.sort((a, b) => a.row - b.row);
  return { entries, warnings };
}

/** Default setlist name from an uploaded file name: no extension, `_` as spaces. */
export function setlistNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^./\\]*$/, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Matching against the catalog
// ---------------------------------------------------------------------------

/** Catalog songs by match key, oldest first so duplicates resolve deterministically. */
function indexCatalog(catalog: Song[]): Map<string, Song[]> {
  const index = new Map<string, Song[]>();
  for (const song of catalog) {
    const key = songMatchKey(song.title, song.artist);
    const list = index.get(key);
    if (list) list.push(song);
    else index.set(key, [song]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return index;
}

export interface PlannedEntry {
  entry: SetlistEntry;
  existing?: Song;
}

export interface SetlistFilePlan {
  entries: PlannedEntry[];
  /** Parse warnings plus one `ambiguousMatch` per row matching several catalog songs. */
  warnings: ImportWarning[];
  matched: number;
  unmatched: number;
}

export function planSetlistFile(parsed: ParsedSetlistFile, catalog: Song[]): SetlistFilePlan {
  const index = indexCatalog(catalog);
  const warnings = [...parsed.warnings];
  const entries = parsed.entries.map((entry): PlannedEntry => {
    const candidates = index.get(songMatchKey(entry.song.title, entry.song.artist)) ?? [];
    if (candidates.length > 1) {
      warnings.push({
        row: entry.row,
        code: IMPORT_WARNING_CODES.ambiguousMatch,
        title: entry.song.title,
        value: String(candidates.length),
      });
    }
    return { entry, existing: candidates[0] };
  });
  warnings.sort((a, b) => a.row - b.row);
  const matched = entries.filter((e) => e.existing).length;
  return { entries, warnings, matched, unmatched: entries.length - matched };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const UNMATCHED_ACTIONS = {
  create: "create",
  skip: "skip",
} as const;

export type UnmatchedAction = (typeof UNMATCHED_ACTIONS)[keyof typeof UNMATCHED_ACTIONS];

export interface SetlistImportFile {
  name: string;
  date?: string;
  venue?: string;
  parsed: ParsedSetlistFile;
}

export interface SetlistImportWrites {
  songs: Song[];
  setlists: Setlist[];
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/** `name`, or `name (2)`, `name (3)`… — the first one not in `taken` (case-insensitive). */
export function uniqueSetlistName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(nameKey(name))) return name;
  let n = 2;
  while (taken.has(nameKey(`${name} (${n})`))) n++;
  return `${name} (${n})`;
}

/**
 * One new setlist per file, never touching existing setlists or songs.
 * Unmatched rows become metadata-only songs (shared across files) or are skipped.
 */
export function buildSetlistImportWrites(
  files: SetlistImportFile[],
  catalog: Song[],
  existingSetlists: Setlist[],
  action: UnmatchedAction,
  now: number,
  createId: () => string,
): SetlistImportWrites {
  const index = indexCatalog(catalog);
  const created = new Map<string, Song>();
  const taken = new Set(existingSetlists.map((s) => nameKey(s.name)));
  const writes: SetlistImportWrites = { songs: [], setlists: [] };

  for (const file of files) {
    const songIds: string[] = [];
    for (const { song } of file.parsed.entries) {
      const key = songMatchKey(song.title, song.artist);
      const existing = index.get(key)?.[0] ?? created.get(key);
      if (existing) {
        songIds.push(existing.id);
      } else if (action === UNMATCHED_ACTIONS.create) {
        const stub: Song = { ...song, id: createId(), createdAt: now, updatedAt: now };
        created.set(key, stub);
        writes.songs.push(stub);
        songIds.push(stub.id);
      }
    }

    const name = uniqueSetlistName(file.name.trim(), taken);
    taken.add(nameKey(name));
    writes.setlists.push({
      id: createId(),
      name,
      date: file.date || undefined,
      venue: file.venue?.trim() || undefined,
      sets: [{ name: FIRST_SET_NAME, songIds }],
      createdAt: now,
      updatedAt: now,
    });
  }
  return writes;
}
