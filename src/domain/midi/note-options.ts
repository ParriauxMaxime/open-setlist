import { noteName } from "./patch";

export interface NoteOption {
  /** The MIDI number as text, what the song stores: "60". */
  value: string;
  /** What Live shows for it: "C3". */
  note: string;
}

const MIDI_NOTE_COUNT = 128;

export const NOTE_OPTIONS: NoteOption[] = Array.from({ length: MIDI_NOTE_COUNT }, (_, n) => ({
  value: String(n),
  note: noteName(n),
}));

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace("♯", "#");
}

/**
 * Notes matching what the musician typed: a number ("6" → 6, 60 to 69), or a note name
 * as Live shows it ("c3", "C#" → every C# octave). Empty: all of them.
 */
export function searchNotes(query: string, limit = MIDI_NOTE_COUNT): NoteOption[] {
  const q = fold(query);
  if (q === "") return NOTE_OPTIONS.slice(0, limit);
  const byNumber = /^\d+$/.test(q);
  return NOTE_OPTIONS.filter((option) =>
    byNumber ? option.value.startsWith(q) : fold(option.note).startsWith(q),
  ).slice(0, limit);
}
