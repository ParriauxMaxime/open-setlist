import {
  CHROMATIC_ROOTS,
  chordName,
  parseChord,
  pianoVoicing,
  QUALITIES,
  QUALITY_IDS,
  type QualityId,
} from "./theory";

describe("chord qualities", () => {
  it.each([
    ["major", "", [0, 4, 7]],
    ["minor", "m", [0, 3, 7]],
    ["dom7", "7", [0, 4, 7, 10]],
    ["min7", "m7", [0, 3, 7, 10]],
    ["maj7", "maj7", [0, 4, 7, 11]],
    ["sus2", "sus2", [0, 2, 7]],
    ["sus4", "sus4", [0, 5, 7]],
    ["dom7sus4", "7sus4", [0, 5, 7, 10]],
    ["dim", "dim", [0, 3, 6]],
    ["dim7", "dim7", [0, 3, 6, 9]],
    ["aug", "aug", [0, 4, 8]],
    ["maj6", "6", [0, 4, 7, 9]],
    ["min6", "m6", [0, 3, 7, 9]],
    ["dom9", "9", [0, 4, 7, 10, 14]],
    ["add9", "add9", [0, 4, 7, 14]],
    ["min9", "m9", [0, 3, 7, 10, 14]],
    ["maj9", "maj9", [0, 4, 7, 11, 14]],
    ["halfDim", "m7b5", [0, 3, 6, 10]],
    ["dom11", "11", [0, 4, 7, 10, 14, 17]],
    ["dom13", "13", [0, 4, 7, 10, 14, 21]],
  ] as const)("%s (C%s) = %j", (id, suffix, intervals) => {
    expect(QUALITIES[id].suffix).toBe(suffix);
    expect(QUALITIES[id].intervals).toEqual(intervals);
    expect(QUALITIES[id].formula.split(" ")).toHaveLength(intervals.length);
  });

  it("every quality is listed once and has a distinct suffix", () => {
    expect(Object.keys(QUALITIES).sort()).toEqual([...QUALITY_IDS].sort());
    const suffixes = QUALITY_IDS.flatMap((id) => [QUALITIES[id].suffix, ...QUALITIES[id].aliases]);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});

describe("parseChord", () => {
  it.each([
    ["C", "C", "major", undefined],
    ["Cm7", "C", "min7", undefined],
    ["F#m7b5", "F#", "halfDim", undefined],
    ["Bbmaj7/D", "Bb", "maj7", "D"],
    ["CΔ7", "C", "maj7", undefined],
    ["Bø", "B", "halfDim", undefined],
    ["C+", "C", "aug", undefined],
    ["Dsus", "D", "sus4", undefined],
    ["Ebo7", "Eb", "dim7", undefined],
    ["Amin/G", "A", "minor", "G"],
    ["G7sus4", "G", "dom7sus4", undefined],
    ["Dbadd9", "Db", "add9", undefined],
  ] as const)("%s → %s %s / %s", (name, root, qualityId, bass) => {
    expect(parseChord(name)).toEqual({
      root,
      qualityId,
      intervals: QUALITIES[qualityId].intervals,
      ...(bass ? { bass } : {}),
    });
  });

  it("drops a bass that is the root", () => {
    expect(parseChord("C/C")?.bass).toBeUndefined();
  });

  it.each([
    "C6/9",
    "N.C.",
    "Cb",
    "H7",
    "",
    "Cm7/X",
    "Bridge",
  ])("%s is not a known chord", (name) => {
    expect(parseChord(name)).toBeNull();
  });

  it("round-trips every root × quality name", () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const id of QUALITY_IDS) {
        expect(parseChord(chordName(root, id))).toMatchObject({ root, qualityId: id });
      }
    }
  });
});

describe("pianoVoicing", () => {
  const voice = (name: string) => {
    const chord = parseChord(name);
    if (!chord) throw new Error(`unparsed ${name}`);
    return pianoVoicing(chord);
  };

  it("stacks the intervals on the root in octave 4", () => {
    expect(voice("C")).toEqual({ notes: [60, 64, 67] });
    expect(voice("Am7")).toEqual({ notes: [69, 72, 76, 79] });
  });

  it("folds extensions that run off the two-octave keyboard", () => {
    // B13: B4 D#5 F#5 A5, C#6 → C#5, G#6 → G#5
    expect(voice("B13").notes).toEqual([71, 75, 78, 81, 73, 80]);
  });

  it("puts a slash bass below the chord", () => {
    expect(voice("C/G")).toEqual({ notes: [72, 76, 79], bass: 67 });
    expect(voice("Am/C")).toEqual({ notes: [69, 72, 76], bass: 60 });
    expect(voice("Cmaj9/B")).toEqual({ notes: [72, 76, 79, 83, 74], bass: 71 });
  });

  it("keeps every root × quality on the keyboard with the right pitch classes", () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const id of QUALITY_IDS as readonly QualityId[]) {
        const chord = parseChord(chordName(root, id));
        if (!chord) throw new Error(`unparsed ${root}${id}`);
        const { notes } = pianoVoicing(chord);
        expect(Math.min(...notes)).toBeGreaterThanOrEqual(60);
        expect(Math.max(...notes)).toBeLessThanOrEqual(83);
        expect(Math.min(...notes)).toBe(notes[0]);
        const classes = notes.map((n) => (n - notes[0]) % 12).sort((a, b) => a - b);
        expect(classes).toEqual(QUALITIES[id].intervals.map((i) => i % 12).sort((a, b) => a - b));
      }
    }
  });
});
