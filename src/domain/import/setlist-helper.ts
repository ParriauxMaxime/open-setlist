/**
 * Import a Setlist Helper catalog export (`/SongCatalog/ExportCsv`).
 *
 * Pure: bytes/text in → songs + warnings out. Writing to the DB is the caller's job.
 */

import type { Song } from "@db/song";
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from "@domain/perform-stage";
import {
  directiveToTags,
  durationToDirective,
  setDirectives,
  tagsToDirective,
} from "../chordpro/directives";
import { decodeTextBytes, parseCsv } from "./csv";
import { decodeHtmlEntities } from "./html-entities";
import { normalizeKey } from "./normalize-key";

export type ImportedSongFields = Omit<Song, "id" | "createdAt" | "updatedAt">;

export interface ImportedSong {
  /** 1-based data row number in the CSV (header excluded). */
  row: number;
  song: ImportedSongFields;
  /** `newscale:N` from `{extra:...}` — not stored on Song yet. */
  fontScale?: number;
}

export const IMPORT_WARNING_CODES = {
  missingTitle: "missingTitle",
  unparseableKey: "unparseableKey",
  invalidTempo: "invalidTempo",
  invalidDuration: "invalidDuration",
  transposeClamped: "transposeClamped",
  duplicateInFile: "duplicateInFile",
  invalidSequence: "invalidSequence",
  ambiguousMatch: "ambiguousMatch",
} as const;

export type ImportWarningCode = (typeof IMPORT_WARNING_CODES)[keyof typeof IMPORT_WARNING_CODES];

export interface ImportWarning {
  row: number;
  code: ImportWarningCode;
  title?: string;
  value?: string;
}

export interface SetlistHelperImport {
  songs: ImportedSong[];
  warnings: ImportWarning[];
}

export class SetlistHelperFormatError extends Error {}

const REQUIRED_COLUMNS = ["Name", "Lyrics"] as const;

/** Directives removed from the body: title/artist + everything Setlist Helper appends. */
const STRIPPED_DIRECTIVES = new Set([
  "t",
  "title",
  "st",
  "subtitle",
  "genre",
  "youtube",
  "other",
  "notes",
  "extra",
  "tempo",
  "key",
  "scrollspeed",
  "transpose",
]);

const TRANSPOSE_MIN = -11;
const TRANSPOSE_MAX = 11;

/** `m:ss`, `h:mm:ss`, or plain seconds. */
const DURATION_RE = /^\d+(:\d{1,2}){0,2}$/;

const DIRECTIVE_TOKEN_RE = /\{\s*(\w+)\s*(?::([^{}]*))?\}/g;
const DIRECTIVE_ONLY_LINE_RE = /^\s*(\{[^{}]*\}\s*)+$/;

interface SplitLyrics {
  body: string;
  directives: Record<string, string>;
}

/**
 * Pull Setlist Helper metadata directives out of the ChordPro source.
 * Only whole-directive lines are touched; every other line is kept verbatim.
 */
function splitLyrics(lyrics: string): SplitLyrics {
  const directives: Record<string, string> = {};
  const kept: string[] = [];

  for (const line of lyrics.replace(/\r\n?/g, "\n").split("\n")) {
    if (!DIRECTIVE_ONLY_LINE_RE.test(line)) {
      kept.push(line);
      continue;
    }
    let stripped = false;
    const rest = line.replace(DIRECTIVE_TOKEN_RE, (token, name: string, value?: string) => {
      const lower = name.toLowerCase();
      if (!STRIPPED_DIRECTIVES.has(lower)) return token;
      stripped = true;
      if (!(lower in directives)) directives[lower] = (value ?? "").trim();
      return "";
    });
    if (!stripped) kept.push(line);
    else if (rest.trim() !== "") kept.push(rest);
  }

  while (kept.length > 0 && kept[0].trim() === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  return { body: kept.join("\n"), directives };
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function parseFiniteNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Find `newscale:N` inside `{extra:scale:0,x:0,y:0,newscale:8}`. */
function parseNewScale(extra: string | undefined): number | undefined {
  const m = extra?.match(/(?:^|,)\s*newscale\s*:\s*(-?[\d.]+)/i);
  return m ? parseFiniteNumber(m[1]) : undefined;
}

/**
 * Rebuild content: our metadata header (same directives and formatting the editor's
 * metadata ↔ content sync writes) followed by the preserved body.
 */
function buildContent(song: ImportedSongFields, body: string): string {
  // Directive values are single-line; multi-line notes are joined for the header only.
  const singleLine = (s: string | undefined) => s?.replace(/\s*\n\s*/g, " / ");
  const header = setDirectives("", [
    ["title", song.title],
    ["artist", song.artist],
    ["key", song.key],
    ["bpm", song.bpm !== undefined ? String(song.bpm) : undefined],
    ["duration", song.duration !== undefined ? durationToDirective(song.duration) : undefined],
    ["tags", song.tags.length > 0 ? tagsToDirective(song.tags) : undefined],
    ["notes", singleLine(song.notes)],
    ["youtube", song.links?.youtube],
  ]).trimEnd();
  return body ? `${header}\n\n${body}` : header;
}

/** Map one CSV record (catalog or setlist export) to song fields. */
export function mapSetlistHelperRecord(
  record: Record<string, string>,
  row: number,
  warnings: ImportWarning[],
): ImportedSong | undefined {
  const { body, directives: d } = splitLyrics(record.Lyrics ?? "");

  const title = firstNonEmpty(record.Name, d.t, d.title);
  if (!title) {
    warnings.push({ row, code: IMPORT_WARNING_CODES.missingTitle });
    return undefined;
  }
  const warn = (code: ImportWarningCode, value?: string) =>
    warnings.push({ row, code, title, value });

  const artist = firstNonEmpty(record.ArtistName, d.st, d.subtitle);

  const genre = firstNonEmpty(record.GenreName, d.genre);
  const tags = genre ? directiveToTags(genre) : [];

  const notes = [firstNonEmpty(record.Notes, d.notes), firstNonEmpty(record.Other, d.other)]
    .filter(Boolean)
    .join("\n");

  const rawKey = firstNonEmpty(record.Key, d.key);
  const key = normalizeKey(rawKey);
  if (rawKey && !key) warn(IMPORT_WARNING_CODES.unparseableKey, rawKey);

  const rawTempo = firstNonEmpty(record.Tempo, d.tempo);
  const tempo = parseFiniteNumber(rawTempo);
  if (rawTempo && tempo === undefined) warn(IMPORT_WARNING_CODES.invalidTempo, rawTempo);
  const bpm = tempo && tempo > 0 ? Math.round(tempo) : undefined;

  const rawLength = firstNonEmpty(record.SongLength);
  let duration: number | undefined;
  if (rawLength && DURATION_RE.test(rawLength)) {
    const seconds = rawLength.split(":").reduce((acc, part) => acc * 60 + Number(part), 0);
    if (seconds > 0) duration = seconds;
  } else if (rawLength) {
    warn(IMPORT_WARNING_CODES.invalidDuration, rawLength);
  }

  const rawTranspose = parseFiniteNumber(d.transpose);
  let transposition: number | undefined;
  if (rawTranspose !== undefined && rawTranspose !== 0) {
    transposition = Math.max(TRANSPOSE_MIN, Math.min(TRANSPOSE_MAX, Math.round(rawTranspose)));
    if (transposition !== rawTranspose) warn(IMPORT_WARNING_CODES.transposeClamped, d.transpose);
  }

  const rawScrollSpeed = parseFiniteNumber(d.scrollspeed);
  const scrollSpeed =
    rawScrollSpeed === undefined
      ? undefined
      : Math.max(SCROLL_SPEED_MIN, Math.min(SCROLL_SPEED_MAX, Math.round(rawScrollSpeed)));

  const youtube = firstNonEmpty(d.youtube);

  const song: ImportedSongFields = {
    title,
    artist,
    key,
    bpm,
    duration,
    tags,
    notes: notes || undefined,
    links: youtube ? { youtube } : undefined,
    transposition,
    scrollSpeed,
    content: "",
  };
  song.content = buildContent(song, body);

  return {
    row,
    song,
    fontScale: parseNewScale(d.extra),
  };
}

/** Normalized title+artist used to match imported songs with existing ones. */
export function songMatchKey(title: string, artist: string | undefined): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return `${norm(title)}|${norm(artist ?? "")}`;
}

/** Column name used only by setlist exports (`/Setlist/ExportCsv`). */
export const SEQUENCE_COLUMN = "SequenceNumber";

/**
 * Decode + parse a Setlist Helper CSV into header-keyed records.
 * Field values have HTML entities decoded. Throws if a required column is missing.
 */
export function readSetlistHelperRecords(
  input: Uint8Array | string,
  required: readonly string[],
): { columns: string[]; records: Record<string, string>[] } {
  const text = typeof input === "string" ? input : decodeTextBytes(input);
  const [header, ...records] = parseCsv(text);
  const columns = (header ?? []).map((h) => h.trim());
  for (const col of required) {
    if (!columns.includes(col)) {
      throw new SetlistHelperFormatError(`Missing column "${col}"`);
    }
  }
  const decoded = records.map((fields) => {
    const record: Record<string, string> = {};
    columns.forEach((col, i) => {
      record[col] = decodeHtmlEntities(fields[i] ?? "");
    });
    return record;
  });
  return { columns, records: decoded };
}

/** Parse a Setlist Helper catalog CSV (raw bytes or already-decoded text). */
export function parseSetlistHelperCsv(input: Uint8Array | string): SetlistHelperImport {
  const { columns, records } = readSetlistHelperRecords(input, REQUIRED_COLUMNS);
  // A setlist export has the catalog columns too; importing it here would create empty charts.
  if (columns.includes(SEQUENCE_COLUMN)) {
    throw new SetlistHelperFormatError("This is a setlist export, not a catalog export");
  }

  const songs: ImportedSong[] = [];
  const warnings: ImportWarning[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const row = index + 1;
    const imported = mapSetlistHelperRecord(record, row, warnings);
    if (!imported) return;

    const matchKey = songMatchKey(imported.song.title, imported.song.artist);
    if (seen.has(matchKey)) {
      warnings.push({
        row,
        code: IMPORT_WARNING_CODES.duplicateInFile,
        title: imported.song.title,
      });
      return;
    }
    seen.add(matchKey);
    songs.push(imported);
  });

  return { songs, warnings };
}

// ---------------------------------------------------------------------------
// Planning against the existing catalog
// ---------------------------------------------------------------------------

export interface ImportMatch<T extends ImportedSong = ImportedSong> {
  imported: T;
  existing: Song;
}

export interface ImportPlan<T extends ImportedSong = ImportedSong> {
  newSongs: T[];
  matches: ImportMatch<T>[];
}

export function planImport<T extends ImportedSong>(imported: T[], existing: Song[]): ImportPlan<T> {
  const byKey = new Map<string, Song>();
  for (const song of existing) {
    const k = songMatchKey(song.title, song.artist);
    if (!byKey.has(k)) byKey.set(k, song);
  }

  const plan: ImportPlan<T> = { newSongs: [], matches: [] };
  for (const item of imported) {
    const match = byKey.get(songMatchKey(item.song.title, item.song.artist));
    if (match) plan.matches.push({ imported: item, existing: match });
    else plan.newSongs.push(item);
  }
  return plan;
}

export const MATCH_STRATEGIES = {
  skip: "skip",
  update: "update",
} as const;

export type MatchStrategy = (typeof MATCH_STRATEGIES)[keyof typeof MATCH_STRATEGIES];

export interface ImportWrites {
  added: Song[];
  updated: Song[];
}

/**
 * Turn a plan into concrete Song rows to write.
 * Updates keep id/createdAt and any existing field the import has no value for.
 */
export function buildImportWrites(
  plan: ImportPlan,
  strategy: MatchStrategy,
  now: number,
  createId: () => string,
): ImportWrites {
  const added = plan.newSongs.map(({ song }) => ({
    ...song,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  }));

  const updated =
    strategy === MATCH_STRATEGIES.update
      ? plan.matches.map(({ imported, existing }) => {
          const defined = Object.fromEntries(
            Object.entries(imported.song).filter(([, v]) => v !== undefined),
          ) as Partial<ImportedSongFields>;
          return {
            ...existing,
            ...defined,
            tags: imported.song.tags.length > 0 ? imported.song.tags : existing.tags,
            links: imported.song.links
              ? { ...existing.links, ...imported.song.links }
              : existing.links,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: now,
          };
        })
      : [];

  return { added, updated };
}
