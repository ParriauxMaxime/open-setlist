import { parseCapo, transposeChord, transposeKey } from "./transpose";

describe("transposeChord without a song key (fixed spelling)", () => {
  it.each([
    ["C", 1, "C#"],
    ["C", 3, "Eb"],
    ["D", 4, "F#"],
    ["E", 4, "Ab"],
    ["A", 1, "Bb"],
    ["Bb", -1, "A"],
    ["Db", 0, "Db"],
    ["Am7", 2, "Bm7"],
    ["Am/G", 2, "Bm/A"],
    ["F#m7b5/C#", 1, "Gm7b5/D"],
    ["C6/9", 2, "D6/9"],
    ["*N.C.", 2, "*N.C."],
    ["*Coda/D", 2, "*Coda/D"],
    ["N.C.", 2, "N.C."],
  ] as const)("%s by %d → %s", (chord, semitones, expected) => {
    expect(transposeChord(chord, semitones)).toBe(expected);
  });

  it("falls back to fixed spelling when the key is unparseable", () => {
    expect(transposeChord("C", 1, "???")).toBe("C#");
    expect(transposeChord("C", 1, "")).toBe("C#");
  });
});

describe("transposeChord with a song key (spelled for the target key)", () => {
  it.each([
    // Dm +3 → Fm: flats
    ["Dm", 3, "A", "C"],
    ["Dm", 3, "Bb", "Db"],
    ["Dm", 3, "F", "Ab"],
    ["Dm", 3, "C#dim", "Edim"],
    ["Dm", 3, "Gm/D", "Bbm/F"],
    // Dm +2 → Em: sharps
    ["Dm", 2, "Bb", "C"],
    ["Dm", 2, "C#", "D#"],
    ["Dm", 2, "Ab", "A#"],
    ["Dm", 2, "F/A", "G/B"],
    // C +1 → Db: flats
    ["C", 1, "G", "Ab"],
    ["C", 1, "Am", "Bbm"],
    ["C", 1, "F#m", "Gm"],
    ["C", 1, "B", "C"],
    // C +2 → D: sharps
    ["C", 2, "E", "F#"],
    ["C", 2, "Eb", "F"],
    ["C", 2, "C#", "D#"],
    // G -2 → F: flats
    ["G", -2, "D7", "C7"],
    ["G", -2, "G#dim", "Gbdim"],
    // A +1 → Bb: flats
    ["A", 1, "C#m", "Dm"],
    ["A", 1, "D", "Eb"],
    ["A", 1, "E/G#", "F/A"],
    // Eb +1 → E: sharps
    ["Eb", 1, "Bb", "B"],
    ["Eb", 1, "G", "G#"],
    ["Eb", 1, "Cm", "C#m"],
    // A +3 → C: no accidentals, fixed spelling
    ["A", 3, "C#m", "Em"],
    ["A", 3, "F", "Ab"],
    ["A", 3, "G", "Bb"],
    // Gm +2 → Am: fixed spelling, leading tone G# sharp
    ["Gm", 2, "Eb", "F"],
    ["Gm", 2, "D/F#", "E/G#"],
    ["Gm", 2, "F#dim", "G#dim"],
    // Em -2 → Dm: flats, leading tone C# sharp
    ["Em", -2, "C", "Bb"],
    ["Em", -2, "B/D#", "A/C#"],
    // Am +1 → Bbm: flats, leading tone A natural
    ["Am", 1, "E/G#", "F/A"],
    ["Am", 1, "C", "Db"],
    // Solfège key: RÉm +3 → Fm
    ["RÉm", 3, "A7", "C7"],
    ["RÉm", 3, "Bb", "Db"],
    // Annotations stay untouched
    ["Dm", 3, "*N.C.", "*N.C."],
  ] as const)("key %s by %d: %s → %s", (key, semitones, chord, expected) => {
    expect(transposeChord(chord, semitones, key)).toBe(expected);
  });

  it("does nothing at 0 semitones, even with a key", () => {
    expect(transposeChord("A#", 0, "F")).toBe("A#");
  });
});

describe("transposeKey", () => {
  it.each([
    ["Dm", 2, "Em"],
    ["Dm", 3, "Fm"],
    ["Dm", 1, "Ebm"],
    ["C", 1, "Db"],
    ["C", 3, "Eb"],
    ["C", 6, "F#"],
    ["D", 3, "F"],
    ["A", 4, "Db"],
    ["Am", 4, "C#m"],
    ["Am", 11, "G#m"],
    ["Em", 6, "Bbm"],
    ["G", -2, "F"],
    ["G", -14, "F"],
    ["Gb", 0, "Gb"],
    ["Gb", 12, "Gb"],
    ["RÉm", 2, "Em"],
    ["SOL#m", 1, "Am"],
  ] as const)("%s by %d → %s", (key, semitones, expected) => {
    expect(transposeKey(key, semitones)).toBe(expected);
  });

  it("returns undefined for unknown keys", () => {
    expect(transposeKey(undefined, 2)).toBeUndefined();
    expect(transposeKey("", 2)).toBeUndefined();
    expect(transposeKey("Hello", 2)).toBeUndefined();
  });
});

describe("parseCapo", () => {
  it.each([
    ["3", 3],
    [" 2 ", 2],
    ["11", 11],
    ["5 (guitar)", 5],
    ["0", undefined],
    ["12", undefined],
    ["-1", undefined],
    ["", undefined],
    ["none", undefined],
    [undefined, undefined],
  ] as const)("%p → %p", (raw, expected) => {
    expect(parseCapo(raw)).toBe(expected);
  });
});
