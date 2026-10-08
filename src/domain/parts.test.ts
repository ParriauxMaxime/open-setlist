import { isKnownPart, normalizePart, sortParts } from "./parts";

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
  ])("%s → %s", (raw, expected) => {
    expect(normalizePart(raw)).toBe(expected);
  });

  it("keeps unknown parts, lowercased, without accents", () => {
    expect(normalizePart("Trombone")).toBe("trombone");
    expect(normalizePart("Chœurs")).toBe("chœurs");
    expect(normalizePart("Flûte")).toBe("flute");
  });

  it("ignores surrounding spaces and trailing punctuation", () => {
    expect(normalizePart("  guitar, ")).toBe("guitar");
  });
});

describe("isKnownPart", () => {
  it("is true for canonical parts only", () => {
    expect(isKnownPart("keys")).toBe(true);
    expect(isKnownPart("piano")).toBe(false);
    expect(isKnownPart("trombone")).toBe(false);
  });
});

describe("sortParts", () => {
  it("dedupes, lists known parts first in table order, then the rest alphabetically", () => {
    expect(sortParts(["trombone", "keys", "guitar", "accordion", "keys", "vocals"])).toEqual([
      "vocals",
      "guitar",
      "keys",
      "accordion",
      "trombone",
    ]);
  });
});
