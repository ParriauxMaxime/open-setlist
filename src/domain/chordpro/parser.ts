/**
 * ChordPro parser — handles standard ChordPro + our extensions.
 *
 * Parses a .chopro file into structured metadata + sections.
 * Backward-compatible: any valid ChordPro file should parse.
 *
 * Key concepts:
 * - Render mode: how a section displays (lyrics, monospace, prose)
 * - Layer: visibility filtering (core, band, instrument)
 * - `for` attribute: scopes a section to a specific instrument
 * - Comment directives become inline comment lines; the first one before any
 *   lyric is the band's setup line (patch code, instruments, capo...)
 * - Chorus recall: `{chorus}` or an empty `{soc}{eoc}` pair
 * - Highlight: `{soh}`…`{eoh}` (Setlist Helper), inline or across lines
 * - Chord definitions: `{define}` (song-wide voicing) and `{chord}` (in place)
 */

import { type ChordDefinition, parseChordDefinition } from "./chord-definitions";

export type { ChordDefinition } from "./chord-definitions";

export type RenderMode = "lyrics" | "monospace" | "prose";
export type Layer = "core" | "band" | "instrument";

export interface ChordProSong {
  metadata: Record<string, string>;
  sections: Section[];
  /** First comment of the song when it comes before any lyric (e.g. `12B 🎸`). */
  setup?: string;
  /** `{define}` and `{chord}` voicings, in source order (only when there are any). */
  chordDefinitions?: ChordDefinition[];
}

export interface Section {
  type: string;
  label?: string;
  renderMode: RenderMode;
  layer: Layer;
  instrument?: string;
  lines: SongLine[];
}

export type CommentStyle = "default" | "italic" | "box" | "highlight";

export interface LyricLine {
  kind: "lyric";
  segments: Segment[];
}

export interface CommentLine {
  kind: "comment";
  style: CommentStyle;
  text: string;
  instrument?: string;
}

export interface ChorusRecallLine {
  kind: "chorus-recall";
  label?: string;
  /** Most recent chorus with lyrics defined before the recall, if any. */
  chorus?: Section;
}

export type SongLine = LyricLine | CommentLine | ChorusRecallLine;

export interface Segment {
  chord?: string;
  text: string;
  highlight?: boolean;
}

const DIRECTIVE_RE = /^\{(\w+)(?::\s*(.+))?\}$/;
const CHORD_RE = /\[([^\]]+)\]/g;

/**
 * Matches a single chord token: root (A-G) + optional accidental (#/b)
 * + optional suffix (m, 7, maj7, sus4, dim, aug, add9, etc.)
 */
const CHORD_TOKEN_RE = /^[A-G][#b]?(?:m(?:aj|in)?|dim|aug|sus|add)?[0-9]?(?:\/[A-G][#b]?)?$/;

/**
 * Expand brackets containing multiple space-separated chords.
 * "[Dm F Am G]" → "[Dm] [F] [Am] [G]"
 * Only expands when ALL space-separated tokens look like valid chords.
 * Leaves single chords and non-chord brackets (like "[x4]") untouched.
 */
function expandMultiChordBrackets(line: string): string {
  return line.replace(CHORD_RE, (full, content: string) => {
    const tokens = content.trim().split(/\s+/);
    if (tokens.length < 2) return full;
    if (tokens.every((t) => CHORD_TOKEN_RE.test(t))) {
      return tokens.map((t) => `[${t}]`).join(" ");
    }
    return full;
  });
}

/**
 * Heuristic: detect bracket-based section labels like [Verse 1 :], [Intro 🎸:], [Solo], etc.
 * These are NOT standard ChordPro but common in exported sheets. We recognize them when:
 * - The line is ONLY a single bracket expression (possibly with trailing whitespace/colon)
 *   OR the bracket content contains a known section keyword
 * - The bracket content does NOT look like a chord (A-G root + optional #/b/m/7/etc.)
 */
const SECTION_KEYWORDS =
  /^(verse|chorus|refrain|couplet|bridge|pont|intro|outro|solo|pre[- ]?chorus|interlude|instrumental|riff|fin|end|breakdown|hook|tag|outro|pr[eé][- ]?refrain|post[- ]?chorus|instru|break|coda)/i;

const BRACKET_SECTION_RE = /^\[([^\]]+)\]\s*$/;

function isBracketSection(line: string): { type: string; label: string } | null {
  const m = line.match(BRACKET_SECTION_RE);
  if (!m) return null;

  const content = m[1].trim();
  // Strip trailing colon for matching
  const cleaned = content.replace(/\s*:\s*$/, "").trim();
  const kwMatch = cleaned.match(SECTION_KEYWORDS);
  if (!kwMatch) return null;

  const keyword = kwMatch[1].toLowerCase().replace(/\s+/g, "-");

  // Map keyword to section type
  let type: string;
  if (/^verse|^couplet/i.test(keyword)) type = "verse";
  else if (/^chorus|^refrain/i.test(keyword)) type = "chorus";
  else if (/^bridge|^pont/i.test(keyword)) type = "bridge";
  else type = keyword;

  return { type, label: cleaned };
}

const SECTION_START: Record<string, string> = {
  start_of_verse: "verse",
  sov: "verse",
  start_of_chorus: "chorus",
  soc: "chorus",
  start_of_bridge: "bridge",
  sob: "bridge",
  start_of_tab: "tab",
  sot: "tab",
};

const SECTION_END = new Set([
  "end_of_verse",
  "eov",
  "end_of_chorus",
  "eoc",
  "end_of_bridge",
  "eob",
  "end_of_tab",
  "eot",
]);

const META_DIRECTIVES = new Set([
  "title",
  "t",
  "subtitle",
  "st",
  "artist",
  "key",
  "bpm",
  "duration",
  "tags",
  "notes",
  "tech_notes",
  "capo",
  "tempo",
  "time",
  "youtube",
]);

const COMMENT_STYLES: Record<string, CommentStyle> = {
  comment: "default",
  c: "default",
  comment_italic: "italic",
  ci: "italic",
  comment_box: "box",
  cb: "box",
  highlight: "highlight",
};

const INLINE_COMMENT_RE = /\{(comment|c|comment_italic|ci|comment_box|cb|highlight):\s*([^}]*)\}/gi;
const HIGHLIGHT_TOGGLE_RE = /\{(soh|eoh)\}/i;

const CORE_TYPES = new Set(["verse", "chorus", "bridge"]);

function getRenderMode(type: string): RenderMode {
  switch (type) {
    case "verse":
    case "chorus":
    case "bridge":
      return "lyrics";
    case "tab":
      return "monospace";
    default:
      return "prose";
  }
}

function getLayer(type: string, instrument?: string): Layer {
  if (instrument) return "instrument";
  if (CORE_TYPES.has(type)) return "core";
  return "band";
}

/**
 * Parse a section directive argument string into label and `for` attribute.
 *
 * Supports:
 *   "Verse 1"                → { label: "Verse 1" }
 *   "Solo, for=guitar"       → { label: "Solo", instrument: "guitar" }
 *   "for=guitar"             → { instrument: "guitar" }
 *   "label="Verse 1""        → { label: "Verse 1" }
 */
function parseSectionArgs(value: string | undefined): { label?: string; instrument?: string } {
  if (!value) return {};

  let label: string | undefined;
  let instrument: string | undefined;

  // Extract for=<instrument> anywhere in the string
  const forMatch = value.match(/\bfor=(\S+)/);
  if (forMatch) {
    instrument = forMatch[1];
  }

  // Extract label="..." if present
  const labelMatch = value.match(/\blabel="([^"]+)"/);
  if (labelMatch) {
    label = labelMatch[1];
  }

  // If no label="" syntax, the part before the first comma (excluding for=) is the label
  if (!label) {
    const withoutFor = value.replace(/,?\s*\bfor=\S+/, "").trim();
    if (withoutFor && !withoutFor.startsWith("for=")) {
      label = withoutFor;
    }
  }

  return { label: label || undefined, instrument: instrument || undefined };
}

/**
 * Check if a directive name is a generic start_of_<name> and extract the environment name.
 */
function parseCustomStart(name: string): string | null {
  const match = name.match(/^start_of_(\w+)$/);
  if (match && !SECTION_START[name]) {
    return match[1];
  }
  return null;
}

/**
 * Check if a directive name is a generic end_of_<name>.
 */
function isCustomEnd(name: string): boolean {
  return /^end_of_\w+$/.test(name) && !SECTION_END.has(name);
}

function makeComment(style: CommentStyle, value: string | undefined): CommentLine | null {
  const { label, instrument } = parseSectionArgs(value?.trim());
  if (!label) return null;
  return { kind: "comment", style, text: label, instrument };
}

function isBlank(line: SongLine): boolean {
  return line.kind === "lyric" && line.segments.every((s) => !s.chord && !s.text.trim());
}

function hasLyricContent(section: Section): boolean {
  return section.lines.some((l) => l.kind === "lyric" && !isBlank(l));
}

function markHighlight(segments: Segment[]): Segment[] {
  return segments.map((s) => ({ ...s, highlight: true }));
}

/**
 * Parse lyric text that may contain `{soh}`/`{eoh}` toggles.
 * Returns the line (null when the text only toggled highlight) and the
 * highlight state to carry over to the next line.
 */
function parseLyric(
  text: string,
  highlightOn: boolean,
): { line: LyricLine | null; highlightOn: boolean } {
  // Splitting on a capture group alternates text pieces and toggle names
  const parts = text.split(HIGHLIGHT_TOGGLE_RE);
  if (parts.length === 1) {
    const { segments } = parseLine(text);
    return {
      line: { kind: "lyric", segments: highlightOn ? markHighlight(segments) : segments },
      highlightOn,
    };
  }
  const segments: Segment[] = [];
  let on = highlightOn;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      on = part.toLowerCase() === "soh";
    } else if (part) {
      const parsed = parseLine(part).segments;
      segments.push(...(on ? markHighlight(parsed) : parsed));
    }
  });
  return { line: segments.length > 0 ? { kind: "lyric", segments } : null, highlightOn: on };
}

export function parse(source: string): ChordProSong {
  const lines = source.split("\n");
  const metadata: Record<string, string> = {};
  const sections: Section[] = [];
  // Cast: TS would otherwise narrow to `null`, as it's only reassigned inside closures
  let currentSection = null as Section | null;
  // Implicit sections hold content found outside any section directive
  let currentImplicit = false;
  let lastChorus: Section | undefined;
  let seenLyrics = false;
  let seenComment = false;
  let setup: string | undefined;
  let highlightOn = false;
  const chordDefinitions: ChordDefinition[] = [];

  const closeSection = () => {
    if (!currentSection) return;
    if (currentSection.type === "chorus" && hasLyricContent(currentSection)) {
      lastChorus = currentSection;
    }
    sections.push(currentSection);
    currentSection = null;
    currentImplicit = false;
  };

  const openSection = (section: Section, implicit = false) => {
    closeSection();
    currentSection = section;
    currentImplicit = implicit;
  };

  const pushLine = (songLine: SongLine) => {
    if (songLine.kind === "lyric" && !isBlank(songLine)) seenLyrics = true;
    if (currentSection) {
      currentSection.lines.push(songLine);
    } else {
      // Lines outside sections go into an implicit section (song content: core layer)
      openSection({ type: "custom", renderMode: "prose", layer: "core", lines: [songLine] }, true);
    }
  };

  const pushComment = (comment: CommentLine | null) => {
    if (!comment) return;
    const isSetup = !seenComment && !seenLyrics;
    seenComment = true;
    if (isSetup) {
      setup = comment.text;
    } else {
      pushLine(comment);
    }
  };

  const recallLine = (label: string | undefined): ChorusRecallLine => ({
    kind: "chorus-recall",
    label,
    chorus: lastChorus,
  });

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      if (currentSection) {
        currentSection.lines.push({ kind: "lyric", segments: [{ text: "" }] });
      }
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const [, name, value] = directive;
      const lower = name.toLowerCase();

      if (META_DIRECTIVES.has(lower)) {
        const key =
          lower === "t"
            ? "title"
            : lower === "st"
              ? "subtitle"
              : lower === "tempo"
                ? "bpm"
                : lower === "tech_notes"
                  ? "techNotes"
                  : lower;
        metadata[key] = value ?? "";
      } else if (COMMENT_STYLES[lower]) {
        pushComment(makeComment(COMMENT_STYLES[lower], value));
      } else if (lower === "soh" || lower === "eoh") {
        highlightOn = lower === "soh";
      } else if (lower === "define" || lower === "chord") {
        const definition = value ? parseChordDefinition(value) : null;
        if (definition) {
          chordDefinitions.push(lower === "chord" ? { ...definition, inline: true } : definition);
        }
      } else if (lower === "chorus") {
        const label = value?.trim() || undefined;
        if (currentSection && !currentImplicit) {
          currentSection.lines.push(recallLine(label));
        } else {
          openSection({
            type: "chorus",
            renderMode: "lyrics",
            layer: "core",
            lines: [recallLine(label)],
          });
          closeSection();
        }
      } else if (SECTION_START[lower]) {
        const sectionType = SECTION_START[lower];
        const { label, instrument } = parseSectionArgs(value);
        openSection({
          type: sectionType,
          label,
          renderMode: getRenderMode(sectionType),
          layer: getLayer(sectionType, instrument),
          instrument,
          lines: [],
        });
      } else if (SECTION_END.has(lower)) {
        // An empty {soc}{eoc} pair means "chorus here" (Setlist Helper convention)
        if (currentSection?.type === "chorus" && currentSection.lines.every(isBlank)) {
          currentSection.lines = [recallLine(currentSection.label)];
        }
        closeSection();
      } else {
        // Check for custom environments: start_of_<name> / end_of_<name>
        const customType = parseCustomStart(lower);
        if (customType) {
          const { label, instrument } = parseSectionArgs(value);
          openSection({
            type: customType,
            label,
            renderMode: getRenderMode(customType),
            layer: getLayer(customType, instrument),
            instrument,
            lines: [],
          });
        } else if (isCustomEnd(lower)) {
          closeSection();
        }
        // Other directives ignored for now
      }
      continue;
    }

    // Heuristic: bracket-based section labels like [Verse 1 :], [Intro 🎸:]
    const bracketSection = isBracketSection(line);
    if (bracketSection) {
      openSection({
        type: bracketSection.type,
        label: bracketSection.label,
        renderMode: getRenderMode(bracketSection.type),
        // Bracket labels ([Intro], [Solo]) are song structure markers
        layer: "core",
        lines: [],
      });
      continue;
    }

    // Keep leading whitespace in monospace (tab) sections so columns stay aligned
    const text = currentSection?.renderMode === "monospace" ? raw.trimEnd() : line;

    // Comment directives trailing lyrics, e.g. "Laisser tomber {comment:↘}"
    const inlineComments: CommentLine[] = [];
    const lyricText = text.replace(INLINE_COMMENT_RE, (_full, name: string, value: string) => {
      const comment = makeComment(COMMENT_STYLES[name.toLowerCase()], value);
      if (comment) inlineComments.push(comment);
      return "";
    });

    const lyric = parseLyric(
      inlineComments.length > 0 ? lyricText.trimEnd() : lyricText,
      highlightOn,
    );
    highlightOn = lyric.highlightOn;
    if (lyric.line && !isBlank(lyric.line)) {
      pushLine(lyric.line);
    }
    for (const comment of inlineComments) pushComment(comment);
  }

  // Close any unclosed section
  closeSection();

  return chordDefinitions.length > 0
    ? { metadata, sections, setup, chordDefinitions }
    : { metadata, sections, setup };
}

function parseLine(raw: string): { segments: Segment[] } {
  const line = expandMultiChordBrackets(raw);
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(CHORD_RE)) {
    const textBefore = line.slice(lastIndex, match.index);
    if (textBefore || segments.length === 0) {
      if (textBefore) {
        segments.push({ text: textBefore });
      }
    }
    // The chord attaches to the text after it
    const chord = match[1];
    lastIndex = (match.index ?? 0) + match[0].length;

    // Look ahead for text until next chord or end
    const nextChord = line.indexOf("[", lastIndex);
    const textAfter = nextChord === -1 ? line.slice(lastIndex) : line.slice(lastIndex, nextChord);
    lastIndex = nextChord === -1 ? line.length : nextChord;

    segments.push({ chord, text: textAfter });
  }

  // Remaining text after last chord
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex) });
  }

  // Plain line with no chords
  if (segments.length === 0) {
    segments.push({ text: line });
  }

  return { segments };
}
