import { foldText, groupSpellings, sameText } from "./text";

describe("foldText", () => {
  it.each([
    ["Variété", "variete"],
    ["VARIETE", "variete"],
    ["  Indochine ", "indochine"],
    ["Ça plane pour moi", "ca plane pour moi"],
  ])("%s → %s", (input, expected) => {
    expect(foldText(input)).toBe(expected);
  });
});

describe("sameText", () => {
  it("ignores case and accents", () => {
    expect(sameText("INDOCHINE", "Indochine")).toBe(true);
    expect(sameText("Variete", "Variété")).toBe(true);
    expect(sameText("Indochine", "Téléphone")).toBe(false);
  });
});

describe("groupSpellings", () => {
  it("keeps one value per group, in its most common spelling", () => {
    expect(
      groupSpellings(["Indochine", "INDOCHINE", "Indochine", "variete", "Variété", "Variété"]),
    ).toEqual(["Indochine", "Variété"]);
  });

  it("keeps the first spelling on a tie", () => {
    expect(groupSpellings(["INDOCHINE", "Indochine"])).toEqual(["INDOCHINE"]);
  });

  it("sorts without regard to case or accents and skips blanks", () => {
    expect(groupSpellings(["zebra", "Éric", "apple", " "])).toEqual(["apple", "Éric", "zebra"]);
  });
});
