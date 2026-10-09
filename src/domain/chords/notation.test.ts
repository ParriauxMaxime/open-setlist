import { formatChord, formatKey, formatPitch, NOTATION_LIST, type Notation } from "./notation";

/** [english, solfege, german] for the 12 pitch classes, plus the other common spellings. */
const ROOTS: [string, string, string][] = [
  ["C", "Do", "C"],
  ["C#", "Do#", "C#"],
  ["D", "Ré", "D"],
  ["Eb", "Mib", "Eb"],
  ["E", "Mi", "E"],
  ["F", "Fa", "F"],
  ["F#", "Fa#", "F#"],
  ["G", "Sol", "G"],
  ["Ab", "Lab", "Ab"],
  ["A", "La", "A"],
  ["Bb", "Sib", "B"],
  ["B", "Si", "H"],
  // Enharmonic spellings
  ["Db", "Réb", "Db"],
  ["D#", "Ré#", "D#"],
  ["Gb", "Solb", "Gb"],
  ["G#", "Sol#", "G#"],
  ["A#", "La#", "A#"],
  ["Cb", "Dob", "Cb"],
  ["B#", "Si#", "H#"],
];

function rows(table: [string, string, string][]): [string, Notation, string][] {
  return table.flatMap(([en, sol, de]) => [
    [en, "english", en],
    [en, "solfege", sol],
    [en, "german", de],
  ]);
}

describe("formatChord", () => {
  it.each(rows(ROOTS))("root %s in %s → %s", (chord, notation, expected) => {
    expect(formatChord(chord, notation)).toBe(expected);
  });

  it.each(
    rows([
      ["Am", "Lam", "Am"],
      ["Am7", "Lam7", "Am7"],
      ["G7", "Sol7", "G7"],
      ["Cmaj7", "Domaj7", "Cmaj7"],
      ["Bbmaj7", "Sibmaj7", "Bmaj7"],
      ["Bm7", "Sim7", "Hm7"],
      ["Dsus4", "Résus4", "Dsus4"],
      ["Bdim", "Sidim", "Hdim"],
      ["Cadd9", "Doadd9", "Cadd9"],
      ["Bbm", "Sibm", "Bm"],
      ["Ebm7", "Mibm7", "Ebm7"],
      ["F#m7b5", "Fa#m7b5", "F#m7b5"],
      ["E7#9", "Mi7#9", "E7#9"],
      ["C6/9", "Do6/9", "C6/9"],
      ["Gaug", "Solaug", "Gaug"],
      ["A+", "La+", "A+"],
      ["Bo7", "Bo7", "Bo7"],
      ["B°7", "Si°7", "H°7"],
      ["Cm(maj7)", "Dom(maj7)", "Cm(maj7)"],
      ["Bsus2", "Sisus2", "Hsus2"],
      ["E5", "Mi5", "E5"],
    ]),
  )("quality %s in %s → %s", (chord, notation, expected) => {
    expect(formatChord(chord, notation)).toBe(expected);
  });

  it.each(
    rows([
      ["Am/G", "Lam/Sol", "Am/G"],
      ["D/F#", "Ré/Fa#", "D/F#"],
      ["F#m7b5/C#", "Fa#m7b5/Do#", "F#m7b5/C#"],
      ["Gm/Bb", "Solm/Sib", "Gm/B"],
      ["Em/B", "Mim/Si", "Em/H"],
      ["Bb/D", "Sib/Ré", "B/D"],
      ["B7/D#", "Si7/Ré#", "H7/D#"],
    ]),
  )("slash chord %s in %s → %s", (chord, notation, expected) => {
    expect(formatChord(chord, notation)).toBe(expected);
  });

  const untouched = [
    "*N.C.",
    "*Coda",
    "*Rit.",
    "N.C.",
    "",
    "x",
    "Hello",
    "Bridge",
    "Coda",
    "Am7 hold",
    "(Am)",
    "am",
    "123",
    "H7",
    // Already written in solfège: not re-converted
    "Do",
    "Do7",
    "Ré",
    "Fa",
    "Fam",
    "Lam",
    "Sol7",
  ];
  it.each(
    untouched.flatMap((chord) => NOTATION_LIST.map((n) => [chord, n] as const)),
  )("leaves %p unchanged in %s", (chord, notation) => {
    expect(formatChord(chord, notation)).toBe(chord);
  });
});

describe("formatKey", () => {
  it.each(
    rows([
      ["C", "Do", "C"],
      ["Dm", "Rém", "Dm"],
      ["Am", "Lam", "Am"],
      ["F#m", "Fa#m", "F#m"],
      ["C#m", "Do#m", "C#m"],
      ["Ebm", "Mibm", "Ebm"],
      ["Bbm", "Sibm", "Bm"],
      ["Bm", "Sim", "Hm"],
      ["Bb", "Sib", "B"],
      ["B", "Si", "H"],
    ]),
  )("%s in %s → %s", (key, notation, expected) => {
    expect(formatKey(key, notation)).toBe(expected);
  });

  it.each([
    ["RÉm", "english", "Dm"],
    ["RÉm", "solfege", "Rém"],
    ["SOL#m", "german", "G#m"],
    ["MI♭", "solfege", "Mib"],
    ["SIb", "german", "B"],
    ["LAm", "german", "Am"],
  ] as const)("normalizes %s in %s → %s", (key, notation, expected) => {
    expect(formatKey(key, notation)).toBe(expected);
  });

  it.each(["", "Hello", "?"])("leaves unparseable key %p unchanged", (key) => {
    expect(formatKey(key, "solfege")).toBe(key);
  });
});

describe("formatPitch", () => {
  it("names instrument pitches with a flat sign", () => {
    expect(formatPitch("Bb", "english")).toBe("B♭");
    expect(formatPitch("Eb", "english")).toBe("E♭");
    expect(formatPitch("F", "english")).toBe("F");
    expect(formatPitch("Bb", "solfege")).toBe("Si♭");
    expect(formatPitch("F", "solfege")).toBe("Fa");
    expect(formatPitch("Bb", "german")).toBe("B");
  });
});
