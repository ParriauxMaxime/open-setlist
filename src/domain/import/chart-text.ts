/**
 * Pasted or plain-text charts → ChordPro song content.
 *
 * - `extractChartMetadata`: title/artist/key/capo/tempo from the header lines of a chart
 *   ("Title - Artist", "Key: Am", "Capo 2", "Tempo 120")
 * - `convertChartText`: metadata directives + chords-over-lyrics body converted to ChordPro
 * - `insertChart`: put a converted chart into existing editor content without losing
 *   the song's metadata
 */

import { removeDirective, setDirectives } from "../chordpro/directives";
import { parse } from "../chordpro/parser";
import {
  convertChordsOverLyrics,
  isChordLine,
  isTabLine,
  looksLikeChordPro,
  parseSectionHeader,
} from "./chords-over-lyrics";
import { normalizeKey } from "./normalize-key";

export interface ChartMetadata {
  title?: string;
  artist?: string;
  key?: string;
  capo?: string;
  bpm?: string;
}

/** Header directives written by the converter, in order. */
const CHART_DIRECTIVES = ["title", "artist", "key", "capo", "bpm"] as const;

/** Header lines are only looked for before the first chord, section or tab line. */
const MAX_HEADER_LINES = 8;

const TITLE_ARTIST_RE = /^(.+?)\s+[-–—]\s+(.+)$/;
/** Ultimate Guitar style: "Wonderwall Chords by Oasis". */
const TITLE_BY_ARTIST_RE =
  /^(.+?)\s+(?:chords|tabs?|lyrics|accords|paroles)\s+(?:by|de|par)\s+(.+)$/i;
const LABELED_FIELD_RE = /^(title|titre|artist|artiste)\s*:\s*(.+)$/i;
/** Any "Label: value" header line ("Tuning: Drop D", "Difficulty: easy"). */
const FIELD_LINE_RE = /^\p{L}[\p{L} ]{1,19}\s*:\s*\S/u;

const KEY_RE =
  /\b(?:key|tonalit[eé]|tonalidad)\s*(?:of\s+|[:=-]\s*)?((?:do|r[eé]|mi|fa|sol|la|si|[A-G])(?:#|b|♯|♭)?(?:\s*(?:minor|mineur|min|major|majeur|maj|m)\b)?)/giu;
const CAPO_RE =
  /\bcapo(?:dastre)?\s*(?:[:=-]\s*)?(?:on\s+|sur\s+|fret\s+)?(\d{1,2})(?:st|nd|rd|th|e|ème|eme)?(?:\s+(?:fret|case))?\b/giu;
const TEMPO_RE = /\b(?:tempo|bpm)\s*(?:[:=-]\s*)?(\d{2,3})(?:\s*bpm)?\b|\b(\d{2,3})\s*bpm\b/giu;
/** What may remain on a metadata line once its fields are removed. */
const LEFTOVER_RE = /^[\s|,;·•/–—-]*$/;

function cleanKey(raw: string): string | undefined {
  return normalizeKey(raw.replace(/\s*(?:maj|major|majeur)$/i, ""));
}

/** Fields of a metadata line, or null if the line holds anything else. */
function parseMetadataLine(line: string): ChartMetadata | null {
  const labeled = LABELED_FIELD_RE.exec(line.trim());
  if (labeled) {
    const field = /^tit/i.test(labeled[1]) ? "title" : "artist";
    return { [field]: labeled[2].trim() };
  }

  const found: ChartMetadata = {};
  let rest = line;
  rest = rest.replace(KEY_RE, (full, raw: string) => {
    const key = cleanKey(raw);
    if (!key) return full;
    found.key = key;
    return " ";
  });
  rest = rest.replace(CAPO_RE, (_full, fret: string) => {
    found.capo = String(Number(fret));
    return " ";
  });
  rest = rest.replace(TEMPO_RE, (_full, a?: string, b?: string) => {
    found.bpm = a ?? b;
    return " ";
  });
  return Object.keys(found).length > 0 && LEFTOVER_RE.test(rest) ? found : null;
}

function parseTitleLine(line: string): ChartMetadata {
  const text = line.trim();
  const m = TITLE_BY_ARTIST_RE.exec(text) ?? TITLE_ARTIST_RE.exec(text);
  return m ? { title: m[1].trim(), artist: m[2].trim() } : { title: text };
}

function isStructureLine(line: string): boolean {
  return isChordLine(line) || isTabLine(line) || parseSectionHeader(line) !== null;
}

/**
 * Read title/artist/key/capo/tempo from the first lines of a plain-text chart and
 * return the remaining body. Only header lines are consumed: a metadata line must hold
 * nothing else, and the first line is a title only when it is set apart (followed by a
 * blank, "Label: value" or section line) or reads "Title - Artist".
 */
export function extractChartMetadata(text: string): { metadata: ChartMetadata; body: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const metadata: ChartMetadata = {};
  const consumed = new Set<number>();
  let seen = 0;

  for (let i = 0; i < lines.length && seen < MAX_HEADER_LINES; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (isStructureLine(line)) break;
    seen++;

    const fields = parseMetadataLine(line);
    if (fields) {
      for (const name of CHART_DIRECTIVES) {
        if (fields[name] && !metadata[name]) metadata[name] = fields[name];
      }
      consumed.add(i);
      continue;
    }

    if (seen === 1 && !metadata.title && !FIELD_LINE_RE.test(line.trim())) {
      const next = lines[i + 1];
      const setApart =
        next === undefined ||
        next.trim() === "" ||
        FIELD_LINE_RE.test(next.trim()) ||
        parseMetadataLine(next) !== null ||
        parseSectionHeader(next) !== null;
      if (setApart || TITLE_ARTIST_RE.test(line.trim())) {
        const { title, artist } = parseTitleLine(line);
        metadata.title = title;
        if (artist && !metadata.artist) metadata.artist = artist;
        consumed.add(i);
      }
    }
    // Other header lines ("Tuning: E A D G B E") stay in the body
  }

  const body = lines.filter((_, i) => !consumed.has(i));
  while (body.length > 0 && body[0].trim() === "") body.shift();
  return { metadata, body: body.join("\n") };
}

function directivesHeader(metadata: ChartMetadata): string {
  return setDirectives(
    "",
    CHART_DIRECTIVES.map((name) => [name, metadata[name]]),
  ).trim();
}

const ANY_DIRECTIVE_LINE_RE = /^\s*\{[^{}]*\}\s*$/m;

export interface ConvertedChart {
  content: string;
  /** The text already used inline ChordPro chords and was kept as is. */
  alreadyChordPro: boolean;
}

/**
 * Pasted text → ChordPro content. Plain-text charts get their header turned into
 * directives and their chords merged into the lyrics; ChordPro is returned unchanged.
 */
export function convertChartText(text: string): ConvertedChart {
  if (looksLikeChordPro(text)) return { content: text.trim(), alreadyChordPro: true };
  // Directives already carry the metadata: only convert the body
  if (ANY_DIRECTIVE_LINE_RE.test(text)) {
    return { content: convertChordsOverLyrics(text), alreadyChordPro: false };
  }
  const { metadata, body } = extractChartMetadata(text);
  const header = directivesHeader(metadata);
  const converted = convertChordsOverLyrics(body);
  return {
    content: [header, converted].filter(Boolean).join("\n\n"),
    alreadyChordPro: false,
  };
}

const DIRECTIVE_RE = /^\s*\{\s*(\w+)\s*(?::[^}]*)?\}\s*$/;

/** Song details kept when a chart is replaced. */
const KEPT_DIRECTIVES = new Set([
  "title",
  "t",
  "subtitle",
  "st",
  "artist",
  "key",
  "bpm",
  "tempo",
  "duration",
  "time",
  "capo",
  "tags",
  "notes",
  "tech_notes",
  "youtube",
]);

/** Aliases that count as an existing directive for each converter field. */
const FIELD_ALIASES: Record<(typeof CHART_DIRECTIVES)[number], string[]> = {
  title: ["title", "t"],
  artist: ["artist", "subtitle", "st"],
  key: ["key"],
  capo: ["capo"],
  bpm: ["bpm", "tempo"],
};

function directiveName(line: string): string | undefined {
  return DIRECTIVE_RE.exec(line)?.[1].toLowerCase();
}

/** True when the content holds anything besides directives and blank lines. */
export function chartHasLyrics(content: string): boolean {
  return content.split("\n").some((line) => line.trim() !== "" && !DIRECTIVE_RE.test(line));
}

export const CHART_INSERT_MODES = {
  replace: "replace",
  append: "append",
} as const;

export type ChartInsertMode = (typeof CHART_INSERT_MODES)[keyof typeof CHART_INSERT_MODES];

/** Editor form values: a field already filled is never overwritten by the chart. */
export type FilledFields = Partial<Record<"title" | "artist" | "key" | "bpm", unknown>>;

/**
 * Put a converted chart into the editor content.
 * - replace: keeps the song's metadata directives (title, key, tempo…), swaps the rest
 * - append: adds the chart after the existing content
 * Chart metadata only fills what the song does not have yet (no directive, empty field).
 */
export function insertChart(
  existing: string,
  chart: string,
  mode: ChartInsertMode,
  filled: FilledFields = {},
): string {
  const chartMeta = parse(chart).metadata;
  let body = chart;
  for (const aliases of Object.values(FIELD_ALIASES)) {
    for (const alias of aliases) body = removeDirective(body, alias);
  }
  body = body.trim();

  const base =
    mode === CHART_INSERT_MODES.append
      ? existing
      : existing
          .split("\n")
          .filter((line) => KEPT_DIRECTIVES.has(directiveName(line) ?? ""))
          .join("\n");

  const present = new Set(base.split("\n").map(directiveName));
  const isFilled = (value: unknown) =>
    typeof value === "number" ? Number.isFinite(value) : value != null && value !== "";
  const patches: Array<[string, string]> = [];
  for (const name of CHART_DIRECTIVES) {
    // Setlist Helper charts carry the artist in {st}
    const raw = name === "artist" ? (chartMeta.artist ?? chartMeta.subtitle) : chartMeta[name];
    const value = raw?.trim();
    if (!value || FIELD_ALIASES[name].some((a) => present.has(a))) continue;
    if (name !== "capo" && isFilled(filled[name])) continue;
    patches.push([name, value]);
  }

  const head = setDirectives(base, patches).trim();
  return [head, body].filter(Boolean).join("\n\n");
}
