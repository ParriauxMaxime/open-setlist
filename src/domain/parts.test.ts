import {
  INSTRUMENT_PITCH,
  INSTRUMENT_PITCH_VALUES,
  isKnownPart,
  normalizePart,
  PART_VALUES,
  partPitch,
  sortParts,
  WRITTEN_PITCH_OFFSET,
  writtenKey,
} from "./parts";

describe("normalizePart", () => {
  it.each([
    ["guitar", "guitar"],
    ["Guitar", "guitar"],
    ["GTR", "guitar"],
    ["guitare", "guitar"],
    ["🎸", "guitar"],
    ["keys", "keys"],
    ["Piano", "keys"],
    ["clavier", "keys"],
    ["keyboards", "keys"],
    ["vocals", "vocals"],
    ["voice", "vocals"],
    ["Chant", "vocals"],
    ["🎙️", "vocals"],
    ["🎙", "vocals"],
    ["batterie", "drums"],
    ["basse", "bass"],
    ["saxophone", "sax"],
    ["trompette", "trumpet"],
    ["violon", "violin"],
    ["clarinette", "clarinet"],
    ["Clarinet", "clarinet"],
    ["alto-sax", "alto-sax"],
    ["sax-alto", "alto-sax"],
    ["Saxophone-Alto", "alto-sax"],
    ["sax-ténor", "tenor-sax"],
    ["saxophone-ténor", "tenor-sax"],
    ["tenorsax", "tenor-sax"],
    ["bari", "baritone-sax"],
    ["sax-baryton", "baritone-sax"],
    ["sax-soprano", "soprano-sax"],
    ["Trombone", "trombone"],
    ["tuba", "tuba"],
    ["soubassophone", "tuba"],
    ["horn", "horn"],
    ["french-horn", "horn"],
    ["cor", "horn"],
    ["📯", "horn"],
    ["flûte", "flute"],
    ["Flute", "flute"],
    ["🪈", "flute"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePart(raw)).toBe(expected);
  });

  it("keeps unknown parts, lowercased, without accents", () => {
    expect(normalizePart("Accordéon")).toBe("accordeon");
    expect(normalizePart("Chœurs")).toBe("chœurs");
  });

  it("does not take voice ranges for saxophones", () => {
    expect(normalizePart("alto")).toBe("alto");
    expect(normalizePart("ténor")).toBe("tenor");
  });

  it("ignores surrounding spaces and trailing punctuation", () => {
    expect(normalizePart("  guitar, ")).toBe("guitar");
  });
});

describe("isKnownPart", () => {
  it("is true for canonical parts only", () => {
    expect(isKnownPart("keys")).toBe(true);
    expect(isKnownPart("piano")).toBe(false);
    expect(isKnownPart("accordion")).toBe(false);
  });
});

describe("sortParts", () => {
  it("dedupes, lists known parts first in table order, then the rest alphabetically", () => {
    expect(sortParts(["banjo", "keys", "guitar", "accordion", "keys", "vocals"])).toEqual([
      "vocals",
      "guitar",
      "keys",
      "accordion",
      "banjo",
    ]);
  });

  it("lists winds in score order", () => {
    expect(sortParts(["tuba", "trumpet", "alto-sax", "flute", "horn", "clarinet"])).toEqual([
      "flute",
      "clarinet",
      "alto-sax",
      "horn",
      "trumpet",
      "tuba",
    ]);
  });
});

describe("instrument pitch", () => {
  it("has a written offset per pitch, octave left out", () => {
    expect(WRITTEN_PITCH_OFFSET).toEqual({ C: 0, Bb: 2, Eb: 9, F: 7 });
    for (const pitch of INSTRUMENT_PITCH_VALUES) {
      expect(WRITTEN_PITCH_OFFSET[pitch]).toBeGreaterThanOrEqual(0);
      expect(WRITTEN_PITCH_OFFSET[pitch]).toBeLessThan(12);
    }
  });

  it.each([
    ["trumpet", "Bb"],
    ["clarinet", "Bb"],
    ["soprano-sax", "Bb"],
    ["tenor-sax", "Bb"],
    ["alto-sax", "Eb"],
    ["baritone-sax", "Eb"],
    ["sax", "Eb"],
    ["horn", "F"],
    ["trombone", "C"],
    ["tuba", "C"],
    ["flute", "C"],
    ["guitar", "C"],
    ["vocals", "C"],
  ])("%s is pitched in %s", (part, pitch) => {
    expect(partPitch(part)).toBe(pitch);
  });

  it("accepts synonyms", () => {
    expect(partPitch("trompette")).toBe(INSTRUMENT_PITCH.bFlat);
    expect(partPitch("Clarinette")).toBe(INSTRUMENT_PITCH.bFlat);
    expect(partPitch("sax-ténor")).toBe(INSTRUMENT_PITCH.bFlat);
    expect(partPitch("saxophone")).toBe(INSTRUMENT_PITCH.eFlat);
    expect(partPitch("🎷")).toBe(INSTRUMENT_PITCH.eFlat);
    expect(partPitch("cor")).toBe(INSTRUMENT_PITCH.f);
  });

  it("puts unknown parts and 'all' in concert pitch", () => {
    expect(partPitch("accordion")).toBe(INSTRUMENT_PITCH.concert);
    expect(partPitch("all")).toBe(INSTRUMENT_PITCH.concert);
  });

  it("covers every known part", () => {
    for (const part of PART_VALUES) {
      expect(INSTRUMENT_PITCH_VALUES).toContain(partPitch(part));
    }
  });
});

describe("writtenKey", () => {
  it.each([
    ["Dm", "Bb", "Em"],
    ["F", "Eb", "D"],
    ["Bb", "Bb", "C"],
    ["Eb", "Eb", "C"],
    ["F", "F", "C"],
    ["C", "Bb", "D"],
    ["Ab", "Bb", "Bb"],
    ["E", "Bb", "F#"],
    ["Gm", "Eb", "Em"],
    ["Dm", "C", "Dm"],
  ] as const)("concert %s on a %s instrument reads %s", (concert, pitch, written) => {
    expect(writtenKey(concert, pitch)).toBe(written);
  });

  it("accepts solfège keys", () => {
    expect(writtenKey("RÉm", INSTRUMENT_PITCH.bFlat)).toBe("Em");
  });

  it("is undefined without a key", () => {
    expect(writtenKey(undefined, INSTRUMENT_PITCH.bFlat)).toBeUndefined();
    expect(writtenKey("", INSTRUMENT_PITCH.eFlat)).toBeUndefined();
  });
});
