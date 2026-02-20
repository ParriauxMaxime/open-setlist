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
 */

export type RenderMode = "lyrics" | "monospace" | "prose";
export type Layer = "core" | "band" | "instrument";

export interface ChordProSong {
  metadata: Record<string, string>;
  sections: Section[];
}

export interface Section {
  type: string;
  label?: string;
  renderMode: RenderMode;
  layer: Layer;
  instrument?: string;
  lines: Line[];
}

export interface Line {
  segments: Segment[];
}

export interface Segment {
  chord?: string;
  text: string;
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
  /^(verse|chorus|refrain|couplet|bridge|pont|intro|outro|solo|pre[- ]?chorus|interlude|instrumental|riff|fin|end|breakdown|hook|tag|outro)/i;

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
  "capo",
  "tempo",
  "youtube",
]);

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

export function parse(source: string): ChordProSong {
  const lines = source.split("\n");
  const metadata: Record<string, string> = {};
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      if (currentSection) {
        currentSection.lines.push({ segments: [{ text: "" }] });
      }
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const [, name, value] = directive;
      const lower = name.toLowerCase();

      if (META_DIRECTIVES.has(lower)) {
        const key =
          lower === "t" ? "title" : lower === "st" ? "subtitle" : lower === "tempo" ? "bpm" : lower;
        metadata[key] = value ?? "";
      } else if (SECTION_START[lower]) {
        // Close any open section
        if (currentSection) {
          sections.push(currentSection);
        }
        const sectionType = SECTION_START[lower];
        const { label, instrument } = parseSectionArgs(value);
        currentSection = {
          type: sectionType,
          label,
          renderMode: getRenderMode(sectionType),
          layer: getLayer(sectionType, instrument),
          instrument,
          lines: [],
        };
      } else if (SECTION_END.has(lower)) {
        if (currentSection) {
          sections.push(currentSection);
          currentSection = null;
        }
      } else {
        // Check for custom environments: start_of_<name> / end_of_<name>
        const customType = parseCustomStart(lower);
        if (customType) {
          if (currentSection) {
            sections.push(currentSection);
          }
          const { label, instrument } = parseSectionArgs(value);
          currentSection = {
            type: customType,
            label,
            renderMode: getRenderMode(customType),
            layer: getLayer(customType, instrument),
            instrument,
            lines: [],
          };
        } else if (isCustomEnd(lower)) {
          if (currentSection) {
            sections.push(currentSection);
            currentSection = null;
          }
        }
        // Other directives ignored for now
      }
      continue;
    }

    // Heuristic: bracket-based section labels like [Verse 1 :], [Intro 🎸:]
    const bracketSection = isBracketSection(line);
    if (bracketSection) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: bracketSection.type,
        label: bracketSection.label,
        renderMode: getRenderMode(bracketSection.type),
        layer: getLayer(bracketSection.type),
        lines: [],
      };
      continue;
    }

    // Regular line with potential chords
    const parsedLine = parseLine(line);
    if (currentSection) {
      currentSection.lines.push(parsedLine);
    } else {
      // Lines outside sections go into an implicit section
      currentSection = {
        type: "custom",
        renderMode: "prose",
        layer: "band",
        lines: [parsedLine],
      };
    }
  }

  // Close any unclosed section
  if (currentSection) {
    sections.push(currentSection);
  }

  return { metadata, sections };
}

function parseLine(raw: string): Line {
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
