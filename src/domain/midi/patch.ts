/**
 * Patch codes: the sound a musician's gear switches to for a song, and the MIDI
 * messages that select it.
 *
 * The band writes the keyboard's code at the start of each chart (`{comment:17A🎸}`): three
 * rows of buttons on the synth, two digits 1 to 8 and a letter A to D, so 8 × 8 × 4 sounds.
 * Other instruments (drum pad, pedalboard) get a code per song in `Song.patches`, usually
 * a plain preset number.
 */

import type { Song } from "@db/song";
import { parse } from "../chordpro/parser";
import { PART } from "../parts";

export const MIDI_ENCODING = {
  /** Two Control Changes: one for the letter, one for the digits. For Ableton, which maps CC. */
  ccPair: "cc-pair",
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

/** A role's code for a song: its own field first, else the chart's code for the keyboard. */
export function songPatch(
  song: Pick<Song, "content" | "patches">,
  role: string,
): string | undefined {
  const own = song.patches?.[role]?.trim();
  if (own) return own;
  if (role !== PART.keys) return undefined;
  return extractPatchCode(parse(song.content).setup ?? "");
}

// ---------------------------------------------------------------------------
// MIDI messages
// ---------------------------------------------------------------------------

export interface PatchEncoding {
  /** 1 to 16. */
  channel: number;
  encoding: MidiEncoding;
  /** Controller numbers of the `cc-pair` encoding. */
  ccBank: number;
  ccSlot: number;
  /** Controller of the Bank Select before a Program Change: 0 (MSB) for most gear, some want 32 (LSB). */
  bankSelectCc: number;
  /** The gear numbers its presets from 1 (most do): preset 1 is Program Change 0. */
  programFromOne: boolean;
}

const CONTROL_CHANGE = 0xb0;
const PROGRAM_CHANGE = 0xc0;

function clamp7(value: number): number {
  return Math.max(0, Math.min(127, value));
}

/** One MIDI channel per role, so several musicians can send to the same computer. */
export function defaultMidiChannel(role: string): number {
  const channels: Record<string, number> = {
    [PART.keys]: 1,
    [PART.guitar]: 2,
    [PART.bass]: 3,
    [PART.vocals]: 4,
    [PART.drums]: 10,
  };
  return channels[role] ?? 5;
}

/** Ableton listens to CC, hardware to Program Change. */
export function defaultMidiEncoding(role: string): MidiEncoding {
  return role === PART.keys ? MIDI_ENCODING.ccPair : MIDI_ENCODING.program;
}

export function patchMessages(code: PatchCode, settings: PatchEncoding): number[][] {
  const channel = Math.max(1, Math.min(16, settings.channel)) - 1;
  const cc = (controller: number, value: number) => [
    CONTROL_CHANGE | channel,
    clamp7(controller),
    clamp7(value),
  ];
  const program = (value: number) => [PROGRAM_CHANGE | channel, clamp7(value)];

  if (settings.encoding === MIDI_ENCODING.ccPair) {
    return code.kind === "grid"
      ? [cc(settings.ccBank, code.bank), cc(settings.ccSlot, code.slot)]
      : [cc(settings.ccSlot, code.value)];
  }
  if (code.kind === "grid") return [cc(settings.bankSelectCc, code.bank), program(code.slot)];
  return [program(settings.programFromOne ? code.value - 1 : code.value)];
}
