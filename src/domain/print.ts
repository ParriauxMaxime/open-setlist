// Print / PDF: stage floor sheet and chart booklet. Pure helpers only — the
// rendering lives in src/modules/print/.

import type { Setlist, Song } from "@db";
import { type ChordProSong, parse } from "./chordpro/parser";
import { transposeKey } from "./chords/transpose";

export const PrintMode = {
  Sheet: "sheet",
  Booklet: "booklet",
} as const;

export type PrintMode = (typeof PrintMode)[keyof typeof PrintMode];

export const PRINT_MODES = Object.values(PrintMode);

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

export interface PrintSong {
  /** 1-based position in the whole setlist, continuous across sets. */
  number: number;
  song: Song;
  /** Key as played, i.e. with the song's transposition applied. */
  key?: string;
  chart: ChordProSong;
}

export interface PrintSet {
  name: string;
  songs: PrintSong[];
  /** Sum of known song durations, in seconds. */
  duration: number;
  unknownDurationCount: number;
}

export interface PrintSetlist {
  /** Sets that have at least one song found in the catalog. */
  sets: PrintSet[];
  songCount: number;
  duration: number;
  unknownDurationCount: number;
}

export function playedKey(song: Pick<Song, "key" | "transposition">): string | undefined {
  if (!song.key) return undefined;
  return song.transposition ? (transposeKey(song.key, song.transposition) ?? song.key) : song.key;
}

/** Resolve a setlist into numbered, printable sets. Songs missing from the catalog are skipped. */
export function buildPrintSetlist(
  setlist: Pick<Setlist, "sets">,
  songs: ReadonlyMap<string, Song>,
  formatKeyLabel: (key: string) => string = (key) => key,
): PrintSetlist {
  const sets: PrintSet[] = [];
  let number = 0;

  for (const set of setlist.sets) {
    const printSongs: PrintSong[] = [];
    let duration = 0;
    let unknownDurationCount = 0;
    for (const songId of set.songIds) {
      const song = songs.get(songId);
      if (!song) continue;
      number++;
      const key = playedKey(song);
      printSongs.push({
        number,
        song,
        key: key && formatKeyLabel(key),
        chart: parse(song.content),
      });
      if (song.duration) duration += song.duration;
      else unknownDurationCount++;
    }
    if (printSongs.length > 0) {
      sets.push({ name: set.name, songs: printSongs, duration, unknownDurationCount });
    }
  }

  return {
    sets,
    songCount: number,
    duration: sets.reduce((sum, s) => sum + s.duration, 0),
    unknownDurationCount: sets.reduce((sum, s) => sum + s.unknownDurationCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Stage sheet auto-fit
// ---------------------------------------------------------------------------

/** Page margin in mm. Keep in sync with `@page` in src/styles/global.css. */
export const PRINT_MARGIN_MM = 12;

const PT_PER_MM = 72 / 25.4;
// A4 portrait content box, in pt
const CONTENT_WIDTH_PT = (210 - 2 * PRINT_MARGIN_MM) * PT_PER_MM;
const CONTENT_HEIGHT_PT = (297 - 2 * PRINT_MARGIN_MM) * PT_PER_MM;
/** Room taken by the setlist line and set heading at the top of each set page. */
const SHEET_HEADER_PT = 80;
/** Height left for song rows on a sheet page, in pt. */
export const SHEET_ROWS_HEIGHT_PT = CONTENT_HEIGHT_PT - SHEET_HEADER_PT;

export const SHEET_TITLE_MAX_PT = 48;
export const SHEET_TITLE_MIN_PT = 18;

// Row geometry, in em of the title font size. Mirrors the markup in
// src/modules/print/components/stage-sheet.tsx — keep both in sync.
const TITLE_LINE_HEIGHT = 1.1;
const SETUP_LINE_HEIGHT = 0.5; // 0.4em text × 1.25 line height
const ROW_PADDING = 0.25;
const ROW_BORDER_PT = 1;
const SIDE_COLUMNS = 3.6; // number + key/BPM columns + gaps
const BOLD_CHAR_WIDTH = 0.6;

export interface SheetRow {
  title: string;
  hasSetup: boolean;
}

/** Estimated height in pt of a set's song rows at the given title size. */
export function estimateSheetHeight(rows: readonly SheetRow[], titlePt: number): number {
  const titleWidth = CONTENT_WIDTH_PT - SIDE_COLUMNS * titlePt;
  const charsPerLine = Math.max(1, Math.floor(titleWidth / (BOLD_CHAR_WIDTH * titlePt)));
  let ems = 0;
  for (const row of rows) {
    const lines = Math.max(1, Math.ceil(row.title.length / charsPerLine));
    ems += lines * TITLE_LINE_HEIGHT + ROW_PADDING + (row.hasSetup ? SETUP_LINE_HEIGHT : 0);
  }
  return ems * titlePt + rows.length * ROW_BORDER_PT;
}

/**
 * Largest title size (pt) that fits a set on one A4 page, clamped to
 * [SHEET_TITLE_MIN_PT, SHEET_TITLE_MAX_PT]. Long sets that don't fit even at
 * the minimum get the minimum and spill onto a second page.
 */
export function sheetTitleSize(rows: readonly SheetRow[]): number {
  for (let pt = SHEET_TITLE_MAX_PT; pt > SHEET_TITLE_MIN_PT; pt--) {
    if (estimateSheetHeight(rows, pt) <= SHEET_ROWS_HEIGHT_PT) return pt;
  }
  return SHEET_TITLE_MIN_PT;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** "2026-03-08" → "Sunday, March 8, 2026" (locale-aware). Unparseable input is returned as-is. */
export function formatSetlistDate(date: string, locale: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  // Local date, so the day doesn't shift with the time zone
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
