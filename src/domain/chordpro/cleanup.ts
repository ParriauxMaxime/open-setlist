/**
 * Tidy what a Setlist Helper import can leave in a chart: the app's own directives
 * appended after the song, and the trailing spaces of its CSV export.
 * Comments, sections, highlights and chord definitions are never touched.
 */

import type { Song } from "@db/song";
import { normalizeKey } from "../import/normalize-key";
import { sameText } from "../text";
import { directiveToTags } from "./directives";

export type CleanupSong = Pick<
  Song,
  "content" | "key" | "bpm" | "tags" | "notes" | "links" | "scrollSpeed" | "transposition"
>;

/** Directive name to "may it go?": true once the song's metadata holds the value. */
const APPENDED_DIRECTIVES: Record<string, (value: string, song: CleanupSong) => boolean> = {
  extra: () => true,
  scrollspeed: (_value, song) => song.scrollSpeed !== undefined,
  genre: (value, song) =>
    directiveToTags(value).every((genre) => song.tags.some((tag) => sameText(tag, genre))),
  youtube: (value, song) => !value || song.links?.youtube === value,
  notes: (value, song) => !value || Boolean(song.notes?.includes(value)),
  other: (value, song) => !value || Boolean(song.notes?.includes(value)),
  tempo: (value, song) => !value || Math.round(Number(value)) === song.bpm,
  key: (value, song) => !value || normalizeKey(value) === song.key,
  transpose: (value, song) => Math.round(Number(value) || 0) === (song.transposition ?? 0),
};

/** What our own content header is made of: a block ending on these is no chart yet. */
const HEADER_DIRECTIVES = new Set([
  "t",
  "title",
  "st",
  "subtitle",
  "artist",
  "key",
  "bpm",
  "duration",
  "tags",
  "notes",
  "youtube",
]);

const DIRECTIVE_TOKEN_RE = /\{\s*(\w+)\s*(?::([^{}]*))?\}/g;
const DIRECTIVE_ONLY_LINE_RE = /^\s*(\{[^{}]*\}\s*)+$/;
const MAX_BLANK_LINES = 2;

interface Directive {
  name: string;
  value: string;
}

/** The directives of a line made of directives only, else null. */
function lineDirectives(line: string): Directive[] | null {
  if (!DIRECTIVE_ONLY_LINE_RE.test(line)) return null;
  return [...line.matchAll(DIRECTIVE_TOKEN_RE)].map((m) => ({
    name: (m[1] ?? "").toLowerCase(),
    value: (m[2] ?? "").trim(),
  }));
}

function isAppendedLine(directives: Directive[] | null): directives is Directive[] {
  return directives?.every((d) => d.name in APPENDED_DIRECTIVES) ?? false;
}

/** Drop the appended directives after the song whose value the song already stores. */
function dropAppendedDirectives(lines: string[], song: CleanupSong): string[] {
  let start = lines.length;
  while (start > 0) {
    const line = lines[start - 1] ?? "";
    if (line.trim() !== "" && !isAppendedLine(lineDirectives(line))) break;
    start--;
  }
  const before = start > 0 ? lineDirectives(lines[start - 1] ?? "") : null;
  if (start === 0 || before?.every((d) => HEADER_DIRECTIVES.has(d.name))) return lines;

  const tail = lines.slice(start).filter((line) => {
    const directives = lineDirectives(line);
    if (!isAppendedLine(directives)) return true;
    return !directives.every((d) => APPENDED_DIRECTIVES[d.name]?.(d.value, song));
  });
  return [...lines.slice(0, start), ...tail];
}

function collapseBlankLines(lines: string[]): string[] {
  let blanks = 0;
  return lines.filter((line) => {
    blanks = line === "" ? blanks + 1 : 0;
    return blanks <= MAX_BLANK_LINES;
  });
}

export function cleanupChart(song: CleanupSong): string {
  const endsWithNewline = song.content.endsWith("\n");
  const lines = dropAppendedDirectives(song.content.split(/\r?\n/), song).map((line) =>
    line.trimEnd(),
  );
  const collapsed = collapseBlankLines(lines);
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === "") collapsed.pop();
  const cleaned = collapsed.join("\n");
  return endsWithNewline && cleaned ? `${cleaned}\n` : cleaned;
}

export function needsCleanup(song: CleanupSong): boolean {
  return cleanupChart(song) !== song.content;
}
