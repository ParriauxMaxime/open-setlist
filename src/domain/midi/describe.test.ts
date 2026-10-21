import { decodeMidiBatch } from "./describe";

describe("decodeMidiBatch", () => {
  it("shows a keyboard song change as one note", () => {
    expect(
      decodeMidiBatch([
        [0x9e, 111, 100],
        [0x8e, 111, 0],
      ]),
    ).toEqual([{ kind: "note", channel: 15, note: 111, name: "D#7" }]);
  });

  it("reads a Program Change from 1 and a Control Change with its value", () => {
    expect(
      decodeMidiBatch([
        [0xb1, 0, 2],
        [0xc1, 11],
        [0xbe, 20, 6],
      ]),
    ).toEqual([
      { kind: "controlChange", channel: 2, controller: 0, value: 2 },
      { kind: "programChange", channel: 2, preset: 12 },
      { kind: "controlChange", channel: 15, controller: 20, value: 6 },
    ]);
  });

  it("keeps what it cannot name as bytes, and drops a Note On of velocity 0", () => {
    expect(
      decodeMidiBatch([
        [0xe0, 0, 64],
        [0x90, 60, 0],
      ]),
    ).toEqual([{ kind: "other", bytes: [0xe0, 0, 64] }]);
  });
});
