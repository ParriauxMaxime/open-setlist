/**
 * Import chart files: ChordPro (`.cho`, `.chopro`, `.chordpro`, `.chord`, `.crd`, `.pro`)
 * and plain text (`.txt`, chords over lyrics). Setlist Helper's mobile app exports one
 * `.cho` per song with its own directives (`{st}` = artist, `{genre}`, `{scrollspeed}`…).
 *
 * Pure: file bytes in → songs + warnings out. Files go through the Setlist Helper record
 * mapping, so metadata, key normalization and the content header match the CSV import.
 */

import { removeDirective } from "../chordpro/directives";
import { parse } from "../chordpro/parser";
import { convertChartText } from "./chart-text";
import { looksLikeChordPro } from "./chords-over-lyrics";
import { decodeTextBytes } from "./csv";
import {
  IMPORT_WARNING_CODES,
  type ImportedSong,
  type ImportWarning,
  type ImportWarningCode,
  mapSetlistHelperRecord,
  songMatchKey,
} from "./setlist-helper";

export const CHART_FILE_EXTENSIONS = [
  ".cho",
  ".chopro",
  ".chordpro",
  ".chord",
  ".crd",
  ".pro",
  ".txt",
] as const;

export const CHART_FILE_WARNING_CODES = {
  ...IMPORT_WARNING_CODES,
  unsupportedFile: "unsupportedFile",
  emptyFile: "emptyFile",
  titleFromFileName: "titleFromFileName",
} as const;

export type ChartFileWarningCode =
  | ImportWarningCode
  | (typeof CHART_FILE_WARNING_CODES)[keyof typeof CHART_FILE_WARNING_CODES];

export interface ChartFileWarning {
  file: string;
  code: ChartFileWarningCode;
  title?: string;
  value?: string;
}

export interface ImportedChart extends ImportedSong {
  file: string;
  /** Plain text converted from chords over lyrics. */
  converted: boolean;
}

export interface ChartFile {
  name: string;
  bytes: Uint8Array;
}

export interface ChartFilesImport {
  songs: ImportedChart[];
  warnings: ChartFileWarning[];
}

const NEW_SONG_RE = /^[ \t]*\{\s*(?:new_song|ns)\s*\}[ \t]*$/gim;

/** Directives the record mapping writes back in the content header (it strips the rest). */
const HEADER_DIRECTIVES = ["artist", "bpm", "duration", "tags"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isChartFileName(name: string): boolean {
  return (CHART_FILE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** "03_Midnight drive.cho" → "03 Midnight drive". */
function fileTitle(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).replace(/_+/g, " ").trim();
}

/** Split a ChordPro file on `{new_song}` / `{ns}`; empty parts are dropped. */
export function splitChordProSongs(text: string): string[] {
  return text
    .split(NEW_SONG_RE)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * Map one song's ChordPro source to song fields.
 * `fallbackTitle` is used (with a warning) when the chart has no `{title}`.
 */
function mapChart(
  content: string,
  fallbackTitle: string,
  row: number,
  warnings: ChartFileWarning[],
  file: string,
): ImportedSong | undefined {
  const meta = parse(content).metadata;
  const hasTitle = !!meta.title?.trim();

  let lyrics = content;
  for (const name of HEADER_DIRECTIVES) lyrics = removeDirective(lyrics, name);

  const recordWarnings: ImportWarning[] = [];
  const imported = mapSetlistHelperRecord(
    {
      Name: hasTitle ? "" : fallbackTitle,
      ArtistName: meta.artist ?? "",
      Tempo: meta.bpm ?? "",
      SongLength: meta.duration ?? "",
      GenreName: meta.tags ?? "",
      Lyrics: lyrics,
    },
    row,
    recordWarnings,
  );
  for (const { code, title, value } of recordWarnings) warnings.push({ file, code, title, value });
  if (!imported) return undefined;

  if (!hasTitle) {
    warnings.push({
      file,
      code: CHART_FILE_WARNING_CODES.titleFromFileName,
      title: imported.song.title,
    });
  }
  const techNotes = meta.techNotes?.trim();
  if (techNotes) imported.song.techNotes = techNotes;
  return imported;
}

/** Decode and map chart files. Songs appearing twice (same title + artist) are kept once. */
export function parseChartFiles(files: ChartFile[]): ChartFilesImport {
  const songs: ImportedChart[] = [];
  const warnings: ChartFileWarning[] = [];
  const seen = new Set<string>();
  let row = 0;

  for (const { name, bytes } of files) {
    if (!isChartFileName(name)) {
      warnings.push({ file: name, code: CHART_FILE_WARNING_CODES.unsupportedFile });
      continue;
    }
    const text = decodeTextBytes(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    if (text.trim() === "") {
      warnings.push({ file: name, code: CHART_FILE_WARNING_CODES.emptyFile });
      continue;
    }

    const parts = splitChordProSongs(text);
    const title = fileTitle(name);

    parts.forEach((part, index) => {
      row++;
      // Any extension may hold chords over lyrics (`.crd` and `.txt` often do)
      const content = looksLikeChordPro(part) ? part : convertChartText(part).content;
      const converted = squash(content) !== squash(part);
      const fallback = parts.length > 1 ? `${title} (${index + 1})` : title;
      const imported = mapChart(content, fallback, row, warnings, name);
      if (!imported) return;

      const key = songMatchKey(imported.song.title, imported.song.artist);
      if (seen.has(key)) {
        warnings.push({
          file: name,
          code: CHART_FILE_WARNING_CODES.duplicateInFile,
          title: imported.song.title,
        });
        return;
      }
      seen.add(key);
      songs.push({ ...imported, file: name, converted });
    });
  }

  return { songs, warnings };
}
