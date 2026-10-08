import { normalizeKey } from "./normalize-key";

describe("normalizeKey", () => {
  it.each([
    ["A", "A"],
    ["Am", "Am"],
    ["C#m", "C#m"],
    ["Bb", "Bb"],
    ["B♭", "Bb"],
    ["A♭m", "Abm"],
    ["LA", "A"],
    ["LAm", "Am"],
    ["LA♭m", "Abm"],
    ["RÉ", "D"],
    ["RÉm", "Dm"],
    ["RÉ#", "D#"],
    ["RE", "D"],
    ["MI", "E"],
    ["MIm", "Em"],
    ["MI♭", "Eb"],
    ["FA#", "F#"],
    ["FAm", "Fm"],
    ["SOL", "G"],
    ["SOLm", "Gm"],
    ["SOL#m", "G#m"],
    ["SIm", "Bm"],
    ["DO", "C"],
    ["do", "C"],
    ["ré m", "Dm"],
    ["F♯m", "F#m"],
    [" Em ", "Em"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });

  it.each([
    ["Cb", "B"],
    ["Fbm", "Em"],
    ["E#", "F"],
    ["B#m", "Cm"],
  ])("maps missing enharmonic spelling %s → %s", (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });

  it.each(["", "garbage", "H", "LA##", "Am7", "123"])("returns undefined for %p", (input) => {
    expect(normalizeKey(input)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normalizeKey(undefined)).toBeUndefined();
  });
});
