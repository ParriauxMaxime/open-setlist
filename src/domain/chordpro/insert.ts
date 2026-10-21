/** What the editor's insert buttons add to a chart. */
export const ChartInsert = {
  Verse: "verse",
  Chorus: "chorus",
  Bridge: "bridge",
  Comment: "comment",
  Chord: "chord",
} as const;

export type ChartInsert = (typeof ChartInsert)[keyof typeof ChartInsert];

export const CHART_INSERT_LIST = [
  ChartInsert.Verse,
  ChartInsert.Chorus,
  ChartInsert.Bridge,
  ChartInsert.Comment,
  ChartInsert.Chord,
] as const;

export interface TextSelection {
  text: string;
  start: number;
  end: number;
}

const SECTION_INSERTS: readonly ChartInsert[] = [
  ChartInsert.Verse,
  ChartInsert.Chorus,
  ChartInsert.Bridge,
];

function lineStart(text: string, index: number): number {
  return text.lastIndexOf("\n", index - 1) + 1;
}

function lineEnd(text: string, index: number): number {
  const end = text.indexOf("\n", index);
  return end === -1 ? text.length : end;
}

/** The text around an insert, with the line breaks that put the insert on lines of its own. */
function aroundOwnLines(before: string, after: string) {
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const trail = after && !after.startsWith("\n") ? "\n" : "";
  return { head: `${before}${lead}`, tail: `${trail}${after}` };
}

function wrapSection({ text, start, end }: TextSelection, section: ChartInsert): TextSelection {
  const open = `{start_of_${section}}`;
  const close = `{end_of_${section}}`;
  if (start === end) {
    const { head, tail } = aroundOwnLines(text.slice(0, start), text.slice(end));
    const caret = head.length + open.length + 1;
    return { text: `${head}${open}\n\n${close}${tail}`, start: caret, end: caret };
  }
  // A selection covers its lines whole; one ending on a line break stops before it
  const from = lineStart(text, start);
  const to = text[end - 1] === "\n" ? end - 1 : lineEnd(text, end);
  const { head, tail } = aroundOwnLines(text.slice(0, from), text.slice(to));
  const block = `${open}\n${text.slice(from, to)}\n${close}`;
  const caret = head.length + block.length;
  return { text: `${head}${block}${tail}`, start: caret, end: caret };
}

function insertComment({ text, start, end }: TextSelection): TextSelection {
  const selected = text.slice(start, end);
  const { head, tail } = aroundOwnLines(text.slice(0, start), text.slice(end));
  const caret = head.length + "{comment: ".length + selected.length;
  return { text: `${head}{comment: ${selected}}${tail}`, start: caret, end: caret };
}

function insertChord({ text, start, end }: TextSelection): TextSelection {
  const selected = text.slice(start, end);
  const caret = start + 1 + selected.length;
  return {
    text: `${text.slice(0, start)}[${selected}]${text.slice(end)}`,
    start: caret,
    end: caret,
  };
}

/** The chart after an insert button, with where the caret lands. */
export function applyChartInsert(selection: TextSelection, insert: ChartInsert): TextSelection {
  if (SECTION_INSERTS.includes(insert)) return wrapSection(selection, insert);
  if (insert === ChartInsert.Comment) return insertComment(selection);
  return insertChord(selection);
}
