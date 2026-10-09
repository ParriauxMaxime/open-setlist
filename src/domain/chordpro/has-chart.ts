import type { ChordProSong } from "./parser";

/** True when the song has something to play: a setup line or at least one line in a section. */
export function hasChart(song: ChordProSong): boolean {
  return song.setup !== undefined || song.sections.some((section) => section.lines.length > 0);
}
