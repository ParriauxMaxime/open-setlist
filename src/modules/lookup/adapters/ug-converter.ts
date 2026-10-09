import { convertChordsOverLyrics, parseSectionHeader } from "@domain/import/chords-over-lyrics";

/**
 * Convert Ultimate Guitar tab content to ChordPro format.
 *
 * UG content is a chords-over-lyrics chart with markup:
 *   [ch]Am[/ch]        → chord, positioned in a chord line above the lyric
 *   [tab]...[/tab]     → wraps chord + lyric line pairs (and real tablature)
 *   [Verse 1], [Chorus], [Intro]… → section headers
 *
 * The markup is stripped (columns then match what UG displays) and the plain chart goes
 * through the shared chords-over-lyrics converter. Section headers the parser does not
 * know (`[Guitar Solo]`) become comments so they are not read as chords.
 */
export function convertUGToChordPro(ugContent: string): string {
  const plain = ugContent
    .replace(/\r\n?/g, "\n")
    .replace(/\[ch\](.*?)\[\/ch\]/g, "$1")
    .replace(/\[\/?tab\]/g, "")
    .split("\n")
    .map((line) => {
      const label = /^\[([A-Za-z][A-Za-z0-9 ]*)\]\s*$/.exec(line)?.[1];
      return label && parseSectionHeader(line) === null ? `{comment: ${label}}` : line;
    })
    .join("\n");
  return convertChordsOverLyrics(plain);
}
