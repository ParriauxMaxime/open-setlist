/**
 * Patch codes: the sound a musician's gear switches to for a song, and the MIDI
 * messages that select it.
 *
 * Each instrument gets a code per song in `Song.patches`, usually a plain preset number.
 * The band also writes the keyboard player's synth code at the start of each chart
 * (`{comment:17A🎸}`: two digits 1 to 8 and a letter A to D). That one is a reading aid
 * shown next to the field, never sent: the MIDI number is mapped per song.
 */

import type { Song } from "@db/song";
import { PART } from "../parts";

export const MIDI_ENCODING = {
  /**
   * One short note whose pitch is the song's number (0 = C-2, 127 = G8), on a channel no
   * instrument plays on. Live maps a note to anything; a CC value only to what it drives.
   */
  note: "note",
  /** One Control Change whose value is the song's number, 0 to 127. For gear that maps CC. */
  controlChange: "cc",
  /** Program Change, after a Bank Select when the code has a letter. For hardware. */
  program: "program",
} as const;

export type MidiEncoding = (typeof MIDI_ENCODING)[keyof typeof MIDI_ENCODING];

export const MIDI_ENCODING_VALUES: MidiEncoding[] = Object.values(MIDI_ENCODING);

export const GRID_BANKS = ["A", "B", "C", "D"] as const;
const GRID_SIZE = 8;

export type PatchCode =
  /** `17A`: slot 0 to 63 from the two digits, bank 0 to 3 from the letter. */
  | { kind: "grid"; slot: number; bank: number }
  /** `12`: a preset number as the musician reads it on their gear. */
  | { kind: "number"; value: number };

export function parsePatchCode(text: string): PatchCode | null {
  const code = text.trim().toUpperCase();
  const grid = /^([1-8])([1-8])\s?([A-D])$/.exec(code);
  if (grid) {
    return {
      kind: "grid",
      slot: (Number(grid[1]) - 1) * GRID_SIZE + (Number(grid[2]) - 1),
      bank: GRID_BANKS.indexOf(grid[3] as (typeof GRID_BANKS)[number]),
    };
  }
  if (/^\d{1,3}$/.test(code)) {
    const value = Number(code);
    return value <= 128 ? { kind: "number", value } : null;
  }
  return null;
}

/** The keyboard code in a chart's setup line: `" 38B 🎙️🎹"` → `"38B"`. */
export function extractPatchCode(setup: string): string | undefined {
  const match = /(?:^|[^\w])([1-8][1-8])\s?([A-Da-d])(?!\w)/.exec(setup);
  return match ? `${match[1]}${match[2].toUpperCase()}` : undefined;
}

export function songPatch(song: Pick<Song, "patches">, role: string): string | undefined {
  return song.patches?.[role]?.trim() || undefined;
}

// ---------------------------------------------------------------------------
// MIDI messages
// ---------------------------------------------------------------------------

export interface PatchEncoding {
  /** 1 to 16. */
  channel: number;
  encoding: MidiEncoding;
  /** Controller of the `cc` encoding: an undefined one (20 to 31) clashes with no gear. */
  cc: number;
  /** Controller of the Bank Select before a Program Change: 0 (MSB) for most gear, some want 32 (LSB). */
  bankSelectCc: number;
  /** The gear numbers its presets from 1 (most do): preset 1 is Program Change 0. */
  programFromOne: boolean;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const PROGRAM_CHANGE = 0xc0;
const NOTE_VELOCITY = 100;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function clamp7(value: number): number {
  return Math.max(0, Math.min(127, value));
}

/** The note Live shows for a MIDI number: 0 is C-2, 60 is C3, 127 is G8. */
export function noteName(note: number): string {
  const value = clamp7(Math.round(note));
  return `${NOTE_NAMES[value % 12]}${Math.floor(value / 12) - 2}`;
}

/** Whether a song's number fits in one note pitch or one CC value. */
export function fitsSevenBits(code: PatchCode): code is { kind: "number"; value: number } {
  return code.kind === "number" && code.value <= 127;
}

/**
 * One MIDI channel per role, so several musicians can send to the same computer. The keyboard
 * sends notes, so it takes a channel its own keys never play on.
 */
export function defaultMidiChannel(role: string): number {
  const channels: Record<string, number> = {
    [PART.keys]: 15,
    [PART.guitar]: 2,
    [PART.bass]: 3,
    [PART.vocals]: 4,
    [PART.drums]: 10,
  };
  return channels[role] ?? 5;
}

/** Ableton maps notes, hardware listens to Program Change. */
export function defaultMidiEncoding(role: string): MidiEncoding {
  return role === PART.keys ? MIDI_ENCODING.note : MIDI_ENCODING.program;
}

/** null when the code does not fit: as a note or over CC, only a number from 0 to 127. */
export function patchMessages(code: PatchCode, settings: PatchEncoding): number[][] | null {
  const channel = Math.max(1, Math.min(16, settings.channel)) - 1;
  const cc = (controller: number, value: number) => [
    CONTROL_CHANGE | channel,
    clamp7(controller),
    clamp7(value),
  ];
  const program = (value: number) => [PROGRAM_CHANGE | channel, clamp7(value)];

  if (settings.encoding === MIDI_ENCODING.note) {
    if (!fitsSevenBits(code)) return null;
    return [
      [NOTE_ON | channel, code.value, NOTE_VELOCITY],
      [NOTE_OFF | channel, code.value, 0],
    ];
  }
  if (settings.encoding === MIDI_ENCODING.controlChange) {
    return fitsSevenBits(code) ? [cc(settings.cc, code.value)] : null;
  }
  if (code.kind === "grid") return [cc(settings.bankSelectCc, code.bank), program(code.slot)];
  return [program(settings.programFromOne ? code.value - 1 : code.value)];
}
