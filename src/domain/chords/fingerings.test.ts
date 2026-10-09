import { getBassFingerings } from "./bass";
import { getFingerings } from "./fingerings";
import { type Fingering, fingeringNotes, pitchClass, requiredIntervals, TUNINGS } from "./fretted";
import { barreFingerings, getGuitarFingerings } from "./guitar";
import {
  CHROMATIC_ROOTS,
  chordName,
  QUALITIES,
  QUALITY_IDS,
  type QualityId,
  ROOT_MIDI,
} from "./theory";
import type { FrettedInstrument } from "./types";
import { getUkuleleFingerings } from "./ukulele";

const ALL_CHORDS = CHROMATIC_ROOTS.flatMap((root) =>
  QUALITY_IDS.map((id) => ({ root, id, name: chordName(root, id) })),
);

function tones(root: string, id: QualityId): Set<number> {
  return new Set(QUALITIES[id].intervals.map((i) => pitchClass(ROOT_MIDI[root] + i)));
}

function soundingClasses(f: Fingering, instrument: FrettedInstrument): number[] {
  return fingeringNotes(f, TUNINGS[instrument]).map(pitchClass);
}

/** Every dot on the diagram falls inside the frets it draws. */
function fitsDiagram(f: Fingering): boolean {
  return f.frets.every((fret) => fret === null || fret === 0 || fret >= f.baseFret);
}

describe("guitar fingerings", () => {
  it.each(ALL_CHORDS)("$name has a fingering that only sounds chord tones", ({
    root,
    id,
    name,
  }) => {
    const fingerings = getGuitarFingerings(name);
    expect(fingerings.length).toBeGreaterThan(0);
    for (const f of fingerings) {
      expect(f.frets).toHaveLength(6);
      const classes = soundingClasses(f, "guitar");
      const chordTones = tones(root, id);
      expect(classes.every((pc) => chordTones.has(pc))).toBe(true);
      // Root in the bass
      expect(classes[0]).toBe(pitchClass(ROOT_MIDI[root]));
      expect(fitsDiagram(f)).toBe(true);
    }
  });

  it.each([
    ["F", "major", [1, 3, 3, 2, 1, 1], [1]],
    ["B", "minor", [null, 2, 4, 4, 3, 2], [2]],
    ["A", "major", [null, 0, 2, 2, 2, 0], undefined],
    ["E", "minor", [0, 2, 2, 0, 0, 0], undefined],
    ["G", "min7", [3, 5, 3, 3, 3, 3], [3]],
    ["C", "dom9", [null, 3, 2, 3, 3, 3], undefined],
    ["C", "min9", [null, 3, 1, 3, 3, 3], undefined],
    ["G", "dim7", [3, null, 2, 3, 2, null], undefined],
    ["B", "halfDim", [null, 2, 3, 2, 3, null], undefined],
    ["C", "dom11", [null, 3, 3, 3, 3, 3], [3]],
    ["G", "dom13", [3, null, 3, 4, 5, null], undefined],
    ["A", "sus2", [null, 0, 2, 2, 0, 0], undefined],
    ["F#", "sus4", [2, 4, 4, 4, 2, 2], [2]],
  ] as const)("barre template: %s %s = %j", (root, id, frets, barres) => {
    const match = barreFingerings(root, id).find(
      (f) => JSON.stringify(f.frets) === JSON.stringify(frets),
    );
    expect(match).toBeDefined();
    expect(match?.barres).toEqual(barres);
  });

  it("moves a template up an octave when it would reach below the nut", () => {
    // A9 from the A-shape `x 0 -1 0 0 0` can't sit at fret 0
    expect(barreFingerings("A", "dom9").map((f) => f.frets)).toContainEqual([
      null,
      12,
      11,
      12,
      12,
      12,
    ]);
  });

  it("keeps the hand-written voicings first", () => {
    expect(getGuitarFingerings("C")[0].frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(getGuitarFingerings("Cadd9")[0].frets).toEqual([null, 3, 2, 0, 3, 0]);
    expect(getGuitarFingerings("Csus4")[0].frets).toEqual([null, 3, 3, 0, 1, 1]);
  });

  it("resolves enharmonic roots, suffix spellings and slash chords", () => {
    expect(getGuitarFingerings("Db")).toEqual(getGuitarFingerings("C#"));
    expect(getGuitarFingerings("Amin7")).toEqual(getGuitarFingerings("Am7"));
    expect(getGuitarFingerings("C/G")).toEqual(getGuitarFingerings("C"));
    expect(getGuitarFingerings("Gbsus2")).toEqual(getGuitarFingerings("F#sus2"));
    expect(getGuitarFingerings("N.C.")).toEqual([]);
  });
});

describe("ukulele fingerings", () => {
  it.each(ALL_CHORDS)("$name has a playable fingering", ({ root, id, name }) => {
    const fingerings = getUkuleleFingerings(name);
    expect(fingerings.length).toBeGreaterThan(0);
    // The 5th may be left out (`2 4 1 0` Fmaj7)
    const required = requiredIntervals(QUALITIES[id].intervals, 4)
      .filter((i) => i !== 7)
      .map((i) => pitchClass(ROOT_MIDI[root] + i));
    for (const f of fingerings) {
      expect(f.frets).toHaveLength(4);
      const classes = soundingClasses(f, "ukulele");
      const chordTones = tones(root, id);
      expect(classes.every((pc) => chordTones.has(pc))).toBe(true);
      expect(required.every((pc) => classes.includes(pc))).toBe(true);
      expect(fitsDiagram(f)).toBe(true);
    }
  });

  it("uses the usual shapes", () => {
    expect(getUkuleleFingerings("C")[0].frets).toEqual([0, 0, 0, 3]);
    expect(getUkuleleFingerings("Am")[0].frets).toEqual([2, 0, 0, 0]);
    expect(getUkuleleFingerings("G7")[0].frets).toEqual([0, 2, 1, 2]);
    expect(getUkuleleFingerings("Bb")[0]).toEqual({
      frets: [3, 2, 1, 1],
      baseFret: 1,
      barres: [1],
    });
  });

  it("keeps the 3rd and 7th of big chords on four strings", () => {
    // G13 → G B F E (no 5th, no 9th)
    const [g13] = getUkuleleFingerings("G13");
    expect(new Set(soundingClasses(g13, "ukulele"))).toEqual(new Set([7, 11, 5, 4]));
  });
});

describe("bass patterns", () => {
  it.each(ALL_CHORDS)("$name has a root + fifth + octave box", ({ root, name }) => {
    const fingerings = getBassFingerings(name);
    expect(fingerings).toHaveLength(2);
    for (const f of fingerings) {
      const notes = fingeringNotes(f, TUNINGS.bass);
      expect(notes).toHaveLength(3);
      expect(pitchClass(notes[0])).toBe(pitchClass(ROOT_MIDI[root]));
      expect(notes[2] - notes[0]).toBe(12);
    }
  });

  it("follows the chord's fifth", () => {
    expect(getBassFingerings("C")[0].frets).toEqual([null, 3, 5, 5]);
    expect(getBassFingerings("Bdim")[0].frets).toEqual([null, 2, 3, 4]);
    expect(getBassFingerings("Caug")[0].frets).toEqual([null, 3, 6, 5]);
    expect(getBassFingerings("E")[0].frets).toEqual([0, 2, 2, null]);
  });

  it("plays the slash bass with its octave", () => {
    expect(getBassFingerings("C/G")[0].frets).toEqual([3, null, 5, null]);
  });
});

describe("getFingerings", () => {
  it.each(["guitar", "ukulele", "bass"] as const)("dispatches %s", (instrument) => {
    expect(getFingerings(instrument, "Am")[0].frets).toHaveLength(TUNINGS[instrument].length);
  });
});
