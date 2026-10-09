import { definedFingerings, definitionFingering, definitionInstrument } from "../chords/fingerings";
import { parseChordDefinition } from "./chord-definitions";
import { parse } from "./parser";

describe("parseChordDefinition", () => {
  it("reads name, base fret, frets and fingers", () => {
    expect(parseChordDefinition("Bm base-fret 2 frets x 1 3 3 2 1 fingers 0 1 3 4 2 1")).toEqual({
      name: "Bm",
      baseFret: 2,
      frets: [null, 1, 3, 3, 2, 1],
      fingers: [0, 1, 3, 4, 2, 1],
    });
  });

  it("defaults base-fret to 1 and fingers are optional", () => {
    expect(parseChordDefinition("Cmaj7 frets x 3 2 0 0 0")).toEqual({
      name: "Cmaj7",
      baseFret: 1,
      frets: [null, 3, 2, 0, 0, 0],
    });
  });

  it.each([
    "D frets x x 0 2 3 2",
    "D frets X X 0 2 3 2",
    "D frets N N 0 2 3 2",
    "D frets -1 -1 0 2 3 2",
  ])("mutes x / N / -1: %s", (value) => {
    expect(parseChordDefinition(value)?.frets).toEqual([null, null, 0, 2, 3, 2]);
  });

  it("skips attributes it doesn't use", () => {
    expect(
      parseChordDefinition("Am base-fret 1 frets x 0 2 2 1 0 display A-minor diagram off"),
    ).toEqual({ name: "Am", baseFret: 1, frets: [null, 0, 2, 2, 1, 0] });
  });

  it("drops fingers that don't match the frets", () => {
    expect(parseChordDefinition("Am frets x 0 2 2 1 0 fingers 0 0 2 3")?.fingers).toBeUndefined();
    expect(
      parseChordDefinition("Am frets x 0 2 2 1 0 fingers 0 0 2 3 1 z")?.fingers,
    ).toBeUndefined();
  });

  it.each([
    ["no frets", "Am"],
    ["empty", ""],
    ["no name", "base-fret 1 frets x 0 2 2 1 0"],
    ["bad fret", "Am frets x 0 2 q 1 0"],
    ["base fret 0", "Am base-fret 0 frets x 0 2 2 1 0"],
    ["base fret not a number", "Am base-fret two frets x 0 2 2 1 0"],
    ["value with no attribute", "Am 1 x 0 2 2 1 0"],
    ["all muted", "Am frets x x x x x x"],
    ["fret off the neck", "Am frets x 0 2 2 1 99"],
  ])("ignores invalid input (%s)", (_label, value) => {
    expect(parseChordDefinition(value)).toBeNull();
  });
});

describe("parse: chord definitions", () => {
  it("collects {define} and {chord} in source order", () => {
    const song = parse(
      [
        "{title: Song}",
        "{define: Bm base-fret 2 frets x 1 3 3 2 1}",
        "{define: Am}",
        "[Bm]Hello",
        "{chord: G frets 3 2 0 0 0 3}",
      ].join("\n"),
    );
    expect(song.chordDefinitions).toEqual([
      { name: "Bm", baseFret: 2, frets: [null, 1, 3, 3, 2, 1] },
      { name: "G", baseFret: 1, frets: [3, 2, 0, 0, 0, 3], inline: true },
    ]);
    // Definitions are not lyrics or metadata
    expect(song.metadata).toEqual({ title: "Song" });
    expect(song.sections).toHaveLength(1);
  });

  it("leaves songs without definitions unchanged", () => {
    expect(parse("[C]Hello").chordDefinitions).toBeUndefined();
  });
});

describe("defined fingerings", () => {
  const defs = parse(
    [
      "{define: Bm base-fret 2 frets x 1 3 3 2 1}",
      "{define: F frets 1 3 3 2 1 1 fingers 1 3 4 2 1 1}",
      "{define: C frets 0 0 0 3}",
      "{define: Db frets x 4 3 1 2 1}",
      "{define: Db frets x 4 6 6 6 4}",
      "{chord: G frets 3 2 0 0 0 3}",
    ].join("\n"),
  ).chordDefinitions;
  if (!defs) throw new Error("no definitions");

  it("turns relative frets into fret numbers from the base fret", () => {
    expect(definitionFingering(defs[0])).toEqual({
      frets: [null, 2, 4, 4, 3, 2],
      baseFret: 2,
      barres: [2],
    });
  });

  it("takes barres from the fingers when given", () => {
    expect(definitionFingering(defs[1]).barres).toEqual([1]);
  });

  it("tells guitar (6 strings) from ukulele (4 strings)", () => {
    expect(definitionInstrument(defs[0])).toBe("guitar");
    expect(definitionInstrument(defs[2])).toBe("ukulele");
  });

  it("matches the chord for the right instrument, last define first", () => {
    expect(definedFingerings(defs, "guitar", "Bm")).toHaveLength(1);
    expect(definedFingerings(defs, "ukulele", "Bm")).toEqual([]);
    expect(definedFingerings(defs, "ukulele", "C")[0].frets).toEqual([0, 0, 0, 3]);
    expect(definedFingerings(defs, "guitar", "C")).toEqual([]);
    expect(definedFingerings(defs, "bass", "Bm")).toEqual([]);
    // Enharmonic spelling, later define wins
    expect(definedFingerings(defs, "guitar", "C#")[0].frets).toEqual([null, 4, 6, 6, 6, 4]);
  });

  it("does not use {chord} diagrams as song-wide definitions", () => {
    expect(definedFingerings(defs, "guitar", "G")).toEqual([]);
  });
});
