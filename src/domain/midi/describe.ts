/** MIDI messages as the Companion page's log shows them: one line per sound change. */

import { noteName } from "./patch";

export const MIDI_MESSAGE_KIND = {
  note: "note",
  controlChange: "controlChange",
  programChange: "programChange",
  other: "other",
} as const;

export type MidiMessageKind = (typeof MIDI_MESSAGE_KIND)[keyof typeof MIDI_MESSAGE_KIND];

export const MIDI_MESSAGE_KIND_VALUES: MidiMessageKind[] = Object.values(MIDI_MESSAGE_KIND);

export type DecodedMidi =
  | { kind: "note"; channel: number; note: number; name: string }
  | { kind: "controlChange"; channel: number; controller: number; value: number }
  /** `preset` counts from 1, as gear and the song editor do. */
  | { kind: "programChange"; channel: number; preset: number }
  | { kind: "other"; bytes: number[] };

function isNoteOff([status = 0, , velocity]: number[]): boolean {
  const type = status & 0xf0;
  return type === 0x80 || (type === 0x90 && velocity === 0);
}

function decode(message: number[]): DecodedMidi {
  const [status = 0, first = 0, second = 0] = message;
  const channel = (status & 0x0f) + 1;
  switch (status & 0xf0) {
    case 0x90:
      return { kind: MIDI_MESSAGE_KIND.note, channel, note: first, name: noteName(first) };
    case 0xb0:
      return { kind: MIDI_MESSAGE_KIND.controlChange, channel, controller: first, value: second };
    case 0xc0:
      return { kind: MIDI_MESSAGE_KIND.programChange, channel, preset: first + 1 };
    default:
      return { kind: MIDI_MESSAGE_KIND.other, bytes: message };
  }
}

/** The messages of a batch, without the Note Off that follows each note: it says nothing more. */
export function decodeMidiBatch(messages: number[][]): DecodedMidi[] {
  return messages.filter((message) => !isNoteOff(message)).map(decode);
}
