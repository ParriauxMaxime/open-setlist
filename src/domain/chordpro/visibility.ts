/**
 * "My part" — filter a parsed song for one musician (docs/CHORDPRO.md §4).
 *
 * - core (verse/chorus/bridge, bracket labels, lines outside sections): always shown
 * - band (comments, tab/note/custom sections without `for=`): shown when `showCues`
 * - instrument (`for=`): shown when the view is "all" or the part matches
 * - `showChords: false` (lyrics only) drops chords from lyric/prose sections; lines
 *   that only held chords disappear. Tab (monospace) sections are notation and stay
 *   untouched — whether they show is decided by their layer.
 * - The setup banner always stays.
 */

import { ALL_PARTS, normalizePart } from "@domain/parts";
import type { ChordProSong, Layer, LyricLine, Section, Segment, SongLine } from "./parser";

export interface PartView {
  /** A part name (any `for=` value, synonyms accepted) or `"all"`. */
  instrument: string;
  showCues: boolean;
  showChords: boolean;
}

export const DEFAULT_PART_VIEW: PartView = {
  instrument: ALL_PARTS,
  showCues: true,
  showChords: true,
};

export function isPartViewActive(view: PartView): boolean {
  return view.instrument !== ALL_PARTS || !view.showCues || !view.showChords;
}

/** Normalized, de-duplicated `for=` values of a song (sections and comments). */
export function songParts(song: ChordProSong): string[] {
  const parts = new Set<string>();
  for (const section of song.sections) {
    if (section.instrument) parts.add(normalizePart(section.instrument));
    for (const line of section.lines) {
      if (line.kind === "comment" && line.instrument) parts.add(normalizePart(line.instrument));
    }
  }
  return [...parts];
}

function isBlankLyric(line: SongLine): boolean {
  return line.kind === "lyric" && line.segments.every((s) => !s.chord && !s.text.trim());
}

/** Lyric line without its chords; null when only chords were on it. */
function stripChords(line: LyricLine): LyricLine | null {
  if (!line.segments.some((s) => s.chord)) return line;
  // Merge what is left, then tidy the spaces the chords leave behind
  const merged: Segment[] = [];
  for (const { text, highlight } of line.segments) {
    const prev = merged[merged.length - 1];
    if (prev && !!prev.highlight === !!highlight) prev.text += text;
    else merged.push(highlight ? { text, highlight } : { text });
  }
  const segments = merged
    .map((s) => ({ ...s, text: s.text.replace(/\s{2,}/g, " ") }))
    .filter((s) => s.text !== "");
  if (segments.every((s) => !s.text.trim())) return null;
  segments[0].text = segments[0].text.trimStart();
  const last = segments[segments.length - 1];
  last.text = last.text.trimEnd();
  return { kind: "lyric", segments };
}

/** Drop leading, trailing and repeated blank lines. */
function tidyBlanks(lines: SongLine[]): SongLine[] {
  const out: SongLine[] = [];
  for (const line of lines) {
    if (isBlankLyric(line) && (out.length === 0 || isBlankLyric(out[out.length - 1]))) continue;
    out.push(line);
  }
  while (out.length > 0 && isBlankLyric(out[out.length - 1])) out.pop();
  return out;
}

export function filterSong(song: ChordProSong, view: PartView): ChordProSong {
  if (!isPartViewActive(view)) return song;

  const wanted = view.instrument === ALL_PARTS ? null : normalizePart(view.instrument);
  const showLayer = (layer: Layer, instrument: string | undefined): boolean => {
    if (layer === "core") return true;
    if (layer === "band") return view.showCues;
    return wanted === null || (!!instrument && normalizePart(instrument) === wanted);
  };

  // Chorus recalls point at sections: map them to their filtered copy
  const filtered = new Map<Section, Section | null>();

  const filterSection = (section: Section): Section | null => {
    const cached = filtered.get(section);
    if (cached !== undefined) return cached;

    let result: Section | null = null;
    if (showLayer(section.layer, section.instrument)) {
      const lines: SongLine[] = [];
      for (const line of section.lines) {
        if (line.kind === "comment") {
          // Inside an instrument section, an untagged comment belongs to that part
          const visible = line.instrument
            ? showLayer("instrument", line.instrument)
            : section.layer === "instrument" || view.showCues;
          if (visible) lines.push(line);
        } else if (line.kind === "chorus-recall") {
          const chorus = line.chorus ? (filterSection(line.chorus) ?? undefined) : undefined;
          lines.push(chorus === line.chorus ? line : { ...line, chorus });
        } else if (view.showChords || section.renderMode === "monospace" || isBlankLyric(line)) {
          lines.push(line);
        } else {
          const stripped = stripChords(line);
          if (stripped) lines.push(stripped);
        }
      }
      const changed =
        lines.length !== section.lines.length || lines.some((l, i) => l !== section.lines[i]);
      const tidied = changed ? tidyBlanks(lines) : lines;
      // A section with a header stays as a structure marker; an unlabeled one
      // emptied by the filter (e.g. a lone cue between sections) goes away
      const hasHeader = !!section.label || section.type !== "custom";
      if (!changed || tidied.length > 0 || hasHeader) {
        result = changed ? { ...section, lines: tidied } : section;
      }
    }
    filtered.set(section, result);
    return result;
  };

  return {
    ...song,
    sections: song.sections.map(filterSection).filter((s): s is Section => s !== null),
  };
}
