/**
 * Plain-text charts ("chords over lyrics") → inline ChordPro.
 *
 *   Am            F                 [Am]Down the empty [F]road again
 *   Down the empty road again   →
 *
 * Pure and line-based, for text copied from websites, PDFs or `.txt` files:
 * - a chord line is merged into the lyric line below it, chords at the same columns
 * - a chord line with no lyric below stays a chord-only line: `[Am] [F]`
 * - section headers (`Verse 1:`, `Refrain`, `(Chorus x2)`) become bracket labels (`[Verse 1]`)
 * - ASCII tab blocks (`e|---3---|`) are wrapped in `{sot}` / `{eot}`
 * - blank lines are kept
 *
 * Text that already holds inline chords (`[Am]word`) is returned untouched. Directive
 * lines (`{title: …}`) and existing tab/grid blocks are passed through as is.
 */

/** Browsers render tabs at 8 columns (CSS `tab-size` default), as do Notepad and terminals. */
const TAB_WIDTH = 8;

const ACCIDENTAL = "(?:#|b|♯|♭)";
const ROOT = `(?:[A-G]|Do|Ré|Re|Mi|Fa|Sol|La|Si)${ACCIDENTAL}?`;
/** Quality and extensions: `m`, `maj7`, `sus4`, `add9`, `7b9`, `m7(b5)`, `6/9`, `°`… */
const SUFFIX = "(?:maj|min|dim|aug|sus|add|alt|m|M|°|ø|Δ|\\+|-|#|b|♯|♭|\\d|\\(|\\)|/(?=\\d))*";
const CHORD_RE = new RegExp(`^${ROOT}${SUFFIX}(?:/${ROOT})?$`);
/** Letter-root chord part: `Fadd9` is F + add9, not solfège Fa + dd9. */
const LETTER_PART_RE = new RegExp(`^[A-G]${ACCIDENTAL}?${SUFFIX}$`);

const SOLFEGE_RE = /^(Do|Ré|Re|Mi|Fa|Sol|La|Si)/;
const SOLFEGE_TO_LETTER: Record<string, string> = {
  Do: "C",
  Ré: "D",
  Re: "D",
  Mi: "E",
  Fa: "F",
  Sol: "G",
  La: "A",
  Si: "B",
};

const NO_CHORD_RE = /^\(?(?:N\.?C\.?|n\.c\.)\)?$/;
const REPEAT_RE = /^\(?(?:[x×*]\s?\d{1,2}|\d{1,2}\s?[x×])\)?$/i;
/** Bars, beat slashes, dashes, repeat signs: rhythm marks between chords. */
const SEPARATOR_RE = /^[|:/\\\-–—%.~]+$/;

/**
 * Section names, EN + FR. Must stay recognized by the parser's bracket-label heuristic
 * (`isBracketSection` in parser.ts), so `[Label]` renders as a section header.
 */
const SECTION_WORD =
  "(?:verse|couplet|chorus|refrain|pre[- ]?chorus|pr[eé][- ]?refrain|post[- ]?chorus|bridge|pont|intro|outro|solo|interlude|instrumental|instru|riff|breakdown|break|coda|hook|tag|ending|end|fin)";
const REPEAT_SUFFIX = "(?:\\(?\\s*(?:[x×]\\s?\\d{1,2}|\\d{1,2}\\s?[x×])\\s*\\)?)";
/** Whole-line header: keyword, optional number, repeat mark or `(note)`, optional colon. */
const HEADER_RE = new RegExp(
  `^(${SECTION_WORD}(?![\\p{L}])(?:\\s*\\d{1,2})?(?:\\s*${REPEAT_SUFFIX})?(?:\\s*\\([^)]*\\))?)\\s*:?$`,
  "iu",
);
/** Header ending with a colon may carry a short free label: `Solo guitare :`. */
const COLON_HEADER_RE = new RegExp(`^(${SECTION_WORD}(?![\\p{L}])[^:]{0,24}?)\\s*:$`, "iu");
/** Header followed by chords on the same line: `Intro: Am F C G`. */
const INLINE_HEADER_RE = new RegExp(
  `^(${SECTION_WORD}(?![\\p{L}])(?:\\s*\\d{1,2})?)\\s*[:\\-–]?\\s+(.+)$`,
  "iu",
);

const DIRECTIVE_LINE_RE = /^\s*\{[^{}]*\}\s*$/;
/** Blocks whose lines must not be touched: tab, grid and delegated environments. */
const RAW_START_RE =
  /^\s*\{\s*(?:sot|sog|start_of_(?:tab|grid|abc|ly|svg|textblock))(?:\s*:[^}]*)?\}\s*$/i;
const RAW_END_RE = /^\s*\{\s*(?:eot|eog|end_of_(?:tab|grid|abc|ly|svg|textblock))\s*\}\s*$/i;

const BRACKET_RE = /\[([^\]\n]+)\]/g;

type TokenKind = "chord" | "noChord" | "repeat" | "separator";

interface Token {
  kind: TokenKind;
  /** ChordPro value: normalized chord, `N.C.`, `x2`; raw text for separators. */
  value: string;
  /** Column (code point index) in the tab-expanded line. */
  col: number;
}

/** `Lam7` → `Am7`, `Sol/Si` → `G/B`, `F♯m` → `F#m`. Stored content is in English letters. */
function normalizeChord(chord: string): string {
  const [main, bass] = chord
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .split(/\/(?=\D)/);
  const toLetters = (part: string) =>
    LETTER_PART_RE.test(part)
      ? part
      : part.replace(SOLFEGE_RE, (name) => SOLFEGE_TO_LETTER[name] ?? name);
  return bass === undefined ? toLetters(main) : `${toLetters(main)}/${toLetters(bass)}`;
}

function classifyToken(text: string): Omit<Token, "col"> | null {
  if (SEPARATOR_RE.test(text)) return { kind: "separator", value: text };
  if (NO_CHORD_RE.test(text)) return { kind: "noChord", value: "N.C." };
  if (REPEAT_RE.test(text)) {
    const count = text.match(/\d+/)?.[0] ?? "";
    return { kind: "repeat", value: `x${count}` };
  }
  // A chord in parentheses is a passing/optional chord: keep the chord, drop the parentheses
  const inner = /^\(([^()]+)\)$/.exec(text)?.[1] ?? text;
  if (CHORD_RE.test(inner)) return { kind: "chord", value: normalizeChord(inner) };
  return null;
}

/** True when `token` reads as a chord (`Am7`, `D/F#`, `Lam`, `Bb`), not a word. */
export function isChordToken(token: string): boolean {
  return CHORD_RE.test(token);
}

/** Split on whitespace; bars stick to chords (`|Am|F|`) so they are split off too. */
function tokenize(line: string): Token[] | null {
  const chars = Array.from(line);
  const tokens: Token[] = [];
  let i = 0;
  while (i < chars.length) {
    if (/\s/.test(chars[i])) {
      i++;
      continue;
    }
    const start = i;
    if (chars[i] === "|") {
      while (i < chars.length && chars[i] === "|") i++;
    } else {
      while (i < chars.length && !/\s/.test(chars[i]) && chars[i] !== "|") i++;
    }
    const classified = classifyToken(chars.slice(start, i).join(""));
    if (!classified) return null;
    tokens.push({ ...classified, col: start });
  }
  return tokens;
}

/**
 * Chord tokens of a chord line, or null for any other line.
 * A chord line only holds chords, `N.C.`, repeat marks (`x2`) and bar/rhythm marks,
 * with at least one chord: a single word ("A day in the life") makes it lyrics.
 */
function chordLineTokens(line: string): Token[] | null {
  const tokens = tokenize(line);
  if (!tokens?.some((t) => t.kind === "chord" || t.kind === "noChord")) return null;
  return tokens;
}

export function isChordLine(line: string): boolean {
  return chordLineTokens(expandTabs(line)) !== null;
}

/**
 * ASCII tab staff line: `e|---3---|`, `|-----|`, `HH|x-x-x-x-|`, `E--0--2--`.
 * Optional string name (1–2 letters), then bars and dashes, with no words.
 */
export function isTabLine(line: string): boolean {
  const m = /^\s*(?:[A-Za-z]{1,2}[#b]?\s?\||[A-Ga-g][#b]?(?=--)|\|)(.*)$/.exec(line);
  if (!m) return false;
  const staff = m[1];
  return (staff.match(/-/g)?.length ?? 0) >= 4 && !/[A-Za-z]{3}/.test(staff);
}

/** Strip decorations around a header: `[Verse 1]`, `(Chorus)`, `*Intro*`, `**Solo:**`. */
function unwrapHeader(line: string): string {
  return line
    .trim()
    .replace(/^\*+\s*(.*?)\s*\*+$/, "$1")
    .replace(/^\[\s*(.*?)\s*\]$/, "$1")
    .replace(/^\(\s*(.*?)\s*\)$/, "$1")
    .trim();
}

/**
 * Section label of a header line (`Chorus:` → `Chorus`, `COUPLET 2 :` → `COUPLET 2`),
 * or null when the line is not a section header.
 */
export function parseSectionHeader(line: string): string | null {
  const text = unwrapHeader(line);
  const m = HEADER_RE.exec(text) ?? COLON_HEADER_RE.exec(text);
  return m ? m[1].trim() : null;
}

/** `Intro: Am F C G` → label + chord tokens of the rest of the line. */
function parseInlineHeader(line: string): { label: string; tokens: Token[] } | null {
  const m = INLINE_HEADER_RE.exec(line.trim());
  if (!m) return null;
  const tokens = chordLineTokens(m[2]);
  return tokens ? { label: m[1].trim(), tokens } : null;
}

/** Expand tabs to the next tab stop so columns match what the author saw. */
export function expandTabs(line: string): string {
  if (!line.includes("\t")) return line;
  let out = "";
  for (const ch of line) {
    if (ch === "\t") out += " ".repeat(TAB_WIDTH - (Array.from(out).length % TAB_WIDTH));
    else out += ch;
  }
  return out;
}

/** CRLF/CR, BOM, NFC, and the non-breaking/zero-width spaces web pages use for alignment. */
function normalizeText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .replace(/[  -   　]/g, " ")
    .replace(/[​-‍⁠]/g, "");
}

/**
 * True when the text already uses inline ChordPro chords: a bracket holding chords
 * (`[Am]`, `[Dm F Am G]`, `[N.C.]`) or an annotation (`[*Coda]`).
 * Bracket section labels such as `[Verse 1]` do not count.
 */
export function looksLikeChordPro(text: string): boolean {
  for (const m of text.matchAll(BRACKET_RE)) {
    const content = m[1].trim();
    if (content.startsWith("*")) return true;
    const tokens = content.split(/\s+/);
    if (tokens.every((t) => CHORD_RE.test(t) || NO_CHORD_RE.test(t))) return true;
  }
  return false;
}

/** Chord-only line: `[Am] [F] [N.C.] [x2]`. Bars and rhythm marks are dropped. */
function chordOnlyLine(tokens: Token[]): string {
  return tokens
    .filter((t) => t.kind !== "separator")
    .map((t) => `[${t.value}]`)
    .join(" ");
}

/**
 * Insert each chord into the lyric at its column. A chord over a space moves to the start
 * of the next word (unless the next chord is already there). Chords past the end of the
 * lyric follow it, one space apart.
 */
function mergeChordLine(tokens: Token[], lyric: string): string {
  const chars = Array.from(lyric.trimEnd());
  const chords = tokens.filter((t) => t.kind !== "separator");
  let out = "";
  let pos = 0;
  chords.forEach((token, index) => {
    const chord = `[${token.value}]`;
    if (token.col < chars.length) {
      let at = token.col;
      while (at < chars.length && /\s/.test(chars[at])) at++;
      if (at >= (chords[index + 1]?.col ?? Number.POSITIVE_INFINITY)) at = token.col;
      out += chars.slice(pos, at).join("") + chord;
      pos = at;
    } else {
      out += chars.slice(pos).join("");
      pos = chars.length;
      out += out === "" || /\s$/.test(out) ? chord : ` ${chord}`;
    }
  });
  out += chars.slice(pos).join("");
  return out.trim();
}

type LineKind = "blank" | "directive" | "tab" | "header" | "chords" | "lyric";

function lineKind(line: string): LineKind {
  if (line.trim() === "") return "blank";
  if (DIRECTIVE_LINE_RE.test(line)) return "directive";
  if (isTabLine(line)) return "tab";
  if (parseSectionHeader(line) !== null || parseInlineHeader(line) !== null) return "header";
  if (chordLineTokens(line)) return "chords";
  return "lyric";
}

/** Convert chords-over-lyrics text, without the "already ChordPro" check. */
export function convertChordsOverLyrics(text: string): string {
  const lines = normalizeText(text).split("\n").map(expandTabs);
  const out: string[] = [];
  let inTab = false;
  let inRawBlock = false;

  const closeTab = () => {
    if (inTab) out.push("{eot}");
    inTab = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inRawBlock) {
      out.push(line.trimEnd());
      if (RAW_END_RE.test(line)) inRawBlock = false;
      continue;
    }

    const kind = lineKind(line);
    if (kind === "tab") {
      if (!inTab) out.push("{sot}");
      inTab = true;
      out.push(line.trimEnd());
      continue;
    }
    closeTab();

    switch (kind) {
      case "blank":
        out.push("");
        break;
      case "directive":
        out.push(line.trim());
        if (RAW_START_RE.test(line)) inRawBlock = true;
        break;
      case "header": {
        const label = parseSectionHeader(line);
        if (label !== null) {
          out.push(`[${label}]`);
        } else {
          const inline = parseInlineHeader(line);
          if (inline) out.push(`[${inline.label}]`, chordOnlyLine(inline.tokens));
        }
        break;
      }
      case "chords": {
        const tokens = chordLineTokens(line) ?? [];
        const next = lines[i + 1];
        if (next !== undefined && lineKind(next) === "lyric") {
          out.push(mergeChordLine(tokens, next));
          i++;
        } else {
          out.push(chordOnlyLine(tokens));
        }
        break;
      }
      default:
        out.push(line.trim());
    }
  }
  closeTab();

  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/**
 * Convert a plain-text chart to ChordPro. Already-ChordPro text is returned unchanged.
 */
export function chordsOverLyricsToChordPro(text: string): string {
  return looksLikeChordPro(text) ? text : convertChordsOverLyrics(text);
}
