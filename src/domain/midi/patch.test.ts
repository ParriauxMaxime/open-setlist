import { encodeBleMidi } from "./bluetooth";
import {
  defaultMidiChannel,
  defaultMidiEncoding,
  extractPatchCode,
  MIDI_ENCODING,
  type PatchEncoding,
  parsePatchCode,
  patchMessages,
  songPatch,
} from "./patch";

const ABLETON: PatchEncoding = {
  channel: 1,
  encoding: MIDI_ENCODING.controlChange,
  cc: 20,
  bankSelectCc: 0,
  programFromOne: true,
};
const HARDWARE: PatchEncoding = { ...ABLETON, channel: 10, encoding: MIDI_ENCODING.program };

function messages(code: string, encoding: PatchEncoding): number[][] | null {
  const parsed = parsePatchCode(code);
  if (!parsed) throw new Error(`Not a patch code: ${code}`);
  return patchMessages(parsed, encoding);
}

describe("parsePatchCode", () => {
  it("reads the synth's three rows of buttons", () => {
    expect(parsePatchCode("11A")).toEqual({ kind: "grid", slot: 0, bank: 0 });
    expect(parsePatchCode("17A")).toEqual({ kind: "grid", slot: 6, bank: 0 });
    expect(parsePatchCode("38b")).toEqual({ kind: "grid", slot: 23, bank: 1 });
    expect(parsePatchCode(" 88 D ")).toEqual({ kind: "grid", slot: 63, bank: 3 });
  });

  it("reads a plain preset number", () => {
    expect(parsePatchCode("12")).toEqual({ kind: "number", value: 12 });
    expect(parsePatchCode("128")).toEqual({ kind: "number", value: 128 });
  });

  it("rejects what the synth cannot show", () => {
    for (const code of ["", "19A", "07B", "17E", "129", "A17", "1A", "12.5", "piano"]) {
      expect(parsePatchCode(code)).toBeNull();
    }
  });
});

describe("extractPatchCode", () => {
  it("finds the code in the band's setup lines", () => {
    expect(extractPatchCode("17A🎸")).toBe("17A");
    expect(extractPatchCode(" 38B 🎙️🎹🎸🪵🥁")).toBe("38B");
    expect(extractPatchCode("14C   -2")).toBe("14C");
    expect(extractPatchCode("🎹 23d Capo 3")).toBe("23D");
  });

  it("ignores lines without one", () => {
    expect(extractPatchCode("Capo 3 🎸")).toBeUndefined();
    expect(extractPatchCode("Drop D")).toBeUndefined();
    expect(extractPatchCode("120 BPM")).toBeUndefined();
    expect(extractPatchCode("19A")).toBeUndefined();
  });
});

describe("songPatch", () => {
  it("reads each instrument's own field", () => {
    expect(songPatch({ patches: { drums: " 12 " } }, "drums")).toBe("12");
    expect(songPatch({ patches: { keys: "11A" } }, "keys")).toBe("11A");
  });

  it("has nothing without a filled field", () => {
    expect(songPatch({}, "keys")).toBeUndefined();
    expect(songPatch({ patches: { keys: "  " } }, "keys")).toBeUndefined();
  });
});

describe("patchMessages", () => {
  it("sends the song's number to Ableton as one Control Change, CC 20 by default", () => {
    expect(messages("0", ABLETON)).toEqual([[0xb0, 20, 0]]);
    expect(messages("111", { ...ABLETON, channel: 16 })).toEqual([[0xbf, 20, 111]]);
    expect(messages("127", ABLETON)).toEqual([[0xb0, 20, 127]]);
  });

  it("sends on the controller of the settings", () => {
    expect(messages("12", { ...ABLETON, channel: 3, cc: 31 })).toEqual([[0xb2, 31, 12]]);
  });

  it("sends nothing over CC that one controller cannot carry", () => {
    expect(messages("128", ABLETON)).toBeNull();
    expect(messages("17A", ABLETON)).toBeNull();
  });

  it("sends a Program Change to hardware, counted from 1 like the gear's display", () => {
    expect(messages("1", HARDWARE)).toEqual([[0xc9, 0]]);
    expect(messages("12", HARDWARE)).toEqual([[0xc9, 11]]);
    expect(messages("12", { ...HARDWARE, programFromOne: false })).toEqual([[0xc9, 12]]);
    expect(messages("0", HARDWARE)).toEqual([[0xc9, 0]]);
  });

  it("selects the bank before the program for a lettered code on hardware", () => {
    expect(messages("21C", HARDWARE)).toEqual([
      [0xb9, 0, 2],
      [0xc9, 8],
    ]);
  });

  it("sends the bank on the controller the gear listens to", () => {
    expect(messages("21C", { ...HARDWARE, bankSelectCc: 32 })).toEqual([
      [0xb9, 32, 2],
      [0xc9, 8],
    ]);
  });

  it("keeps the channel within 1 to 16", () => {
    expect(messages("1", { ...HARDWARE, channel: 0 })).toEqual([[0xc0, 0]]);
    expect(messages("1", { ...HARDWARE, channel: 99 })).toEqual([[0xcf, 0]]);
  });
});

describe("role defaults", () => {
  it("gives each role its own channel, drums on 10", () => {
    expect(defaultMidiChannel("keys")).toBe(1);
    expect(defaultMidiChannel("guitar")).toBe(2);
    expect(defaultMidiChannel("drums")).toBe(10);
    expect(defaultMidiChannel("trumpet")).toBe(5);
  });

  it("talks CC to Ableton for the keyboard, Program Change to the rest", () => {
    expect(defaultMidiEncoding("keys")).toBe(MIDI_ENCODING.controlChange);
    expect(defaultMidiEncoding("drums")).toBe(MIDI_ENCODING.program);
  });
});

describe("encodeBleMidi", () => {
  it("wraps messages in a BLE MIDI packet with its timestamp bytes", () => {
    const [packet, ...rest] = encodeBleMidi(
      [
        [0xb0, 21, 0],
        [0xb0, 20, 6],
      ],
      0b1_0101_0110_0011,
    );
    expect(rest).toEqual([]);
    expect(Array.from(packet)).toEqual([
      0x80 | 0b10_1010,
      0x80 | 0b110_0011,
      0xb0,
      21,
      0,
      0x80 | 0b110_0011,
      0xb0,
      20,
      6,
    ]);
  });

  it("splits what does not fit in 20 bytes", () => {
    const six = Array.from({ length: 6 }, (_, i) => [0xb0, 20, i]);
    const packets = encodeBleMidi(six, 0);
    expect(packets.map((p) => p.length)).toEqual([17, 9]);
    expect(packets.every((p) => p[0] === 0x80 && p.length <= 20)).toBe(true);
  });

  it("sends nothing for no message", () => {
    expect(encodeBleMidi([], 0)).toEqual([]);
  });
});
