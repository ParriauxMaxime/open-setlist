import { parse } from "@domain/chordpro/parser";
import { convertUGToChordPro } from "./ug-converter";

const text = (...lines: string[]) => lines.join("\n");

describe("convertUGToChordPro", () => {
  it("merges [ch] chord lines into the lyrics, at the displayed columns", () => {
    const ug = text(
      "[Verse 1]",
      "[tab][ch]Am[/ch]            [ch]F[/ch]",
      "Down the empty road again[/tab]",
      "[tab][ch]C[/ch]          [ch]G[/ch]",
      "Headlights cutting through[/tab]",
    );
    expect(convertUGToChordPro(ug)).toBe(
      text("[Verse 1]", "[Am]Down the empty [F]road again", "[C]Headlights [G]cutting through"),
    );
  });

  it("keeps single-chord and chord-only lines as chords", () => {
    const ug = text("[Intro]", "[ch]Em7[/ch]  [ch]G[/ch]  [ch]Dsus4[/ch]", "", "[ch]Am[/ch]", "Oh");
    expect(convertUGToChordPro(ug)).toBe(text("[Intro]", "[Em7] [G] [Dsus4]", "", "[Am]Oh"));
  });

  it("wraps real tablature in {sot}/{eot}", () => {
    const ug = text("[Riff]", "[tab]e|---0---1---|", "B|---1---1---|[/tab]");
    expect(convertUGToChordPro(ug)).toBe(
      text("[Riff]", "{sot}", "e|---0---1---|", "B|---1---1---|", "{eot}"),
    );
  });

  it("turns unknown section labels into comments instead of chords", () => {
    const song = parse(convertUGToChordPro(text("[Guitar Solo]", "[ch]Am[/ch]", "", "[Chorus]")));
    expect(song.setup).toBe("Guitar Solo");
    expect(song.sections.map((s) => s.type)).toEqual(["custom", "chorus"]);
  });
});
