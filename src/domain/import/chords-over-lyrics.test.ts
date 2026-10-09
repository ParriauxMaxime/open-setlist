import { parse } from "../chordpro/parser";
import {
  chordsOverLyricsToChordPro,
  expandTabs,
  isChordLine,
  isChordToken,
  isTabLine,
  looksLikeChordPro,
  parseSectionHeader,
} from "./chords-over-lyrics";

/** Build multi-line text from lines (keeps column alignment readable in tests). */
const text = (...lines: string[]) => lines.join("\n");

describe("isChordToken", () => {
  it.each([
    "A",
    "Am",
    "C#m7",
    "Bb",
    "Bbmaj7",
    "F#m7b5",
    "D/F#",
    "Am7/G",
    "Dsus4",
    "Asus2",
    "Cadd9",
    "G6/9",
    "E7#9",
    "Cmaj7#11",
    "CM7",
    "Edim7",
    "C°",
    "Eaug",
    "A+",
    "E5",
    "Bm7(b5)",
    "F♯m",
    "B♭",
    "Lam",
    "Do7",
    "Ré",
    "Sib",
    "Sol/Si",
  ])("%s is a chord", (token) => {
    expect(isChordToken(token)).toBe(true);
  });

  it.each([
    "a",
    "am",
    "Add",
    "Be",
    "Bad",
    "Dad",
    "Cab",
    "Day",
    "Amino",
    "Hello",
    "I",
    "H7",
    "la",
  ])("%s is not a chord", (token) => {
    expect(isChordToken(token)).toBe(false);
  });
});

describe("isChordLine", () => {
  it.each([
    ["spaced chords", "Am        F         C    G"],
    ["single chord", "Am"],
    ["single letter chord", "A"],
    ["slash and extensions", "  D/F#   Em7   Cadd9   Gsus4"],
    ["bars", "| Am | F | C | G |"],
    ["bars stuck to chords", "|Am|F|C|G|"],
    ["beat slashes", "Am / / / | F / / /"],
    ["repeat mark", "Am  F  C  G  x2"],
    ["repeat in parentheses", "Am  F  (x4)"],
    ["no chord", "N.C.     E5"],
    ["passing chord in parentheses", "G   (Am)   C"],
    ["dashes between chords", "Am - F - C - G"],
    ["solfège chords", "Lam    Fa    Do    Sol"],
  ])("%s", (_name, line) => {
    expect(isChordLine(line)).toBe(true);
  });

  it.each([
    ["lyric starting with A", "A day in the life"],
    ["lyric starting with Am", "Am I wrong"],
    ["lowercase words", "a b c"],
    ["chords mixed with words", "Am F C G and back to the verse"],
    ["repeat mark alone", "x2"],
    ["bars alone", "| | |"],
    ["French lyric", "La la la, si tu savais"],
    ["La la la", "La la la"],
    ["blank", "   "],
    ["section header", "Chorus:"],
  ])("%s is not a chord line", (_name, line) => {
    expect(isChordLine(line)).toBe(false);
  });
});

describe("isTabLine", () => {
  it.each([
    "e|---0---1---3---|",
    "B|-----1-----1---|",
    "E|-----|",
    "e |--3--5--|",
    "|---------|---------|",
    "HH|x-x-x-x-|x-x-x-x-|",
    "e--0--3--5--",
    "G|--5h7--7p5--|",
  ])("%s is a tab line", (line) => {
    expect(isTabLine(line)).toBe(true);
  });

  it.each([
    "| Am | F | C | G |",
    "Am ---- F ----",
    "-----------------",
    "Down the road -- again",
    "e|--- the end ---|",
  ])("%s is not a tab line", (line) => {
    expect(isTabLine(line)).toBe(false);
  });
});

describe("parseSectionHeader", () => {
  it.each([
    ["[Verse 1]", "Verse 1"],
    ["Verse 1:", "Verse 1"],
    ["VERSE 2", "VERSE 2"],
    ["Chorus", "Chorus"],
    ["Chorus:", "Chorus"],
    ["Chorus x2", "Chorus x2"],
    ["Chorus (x2)", "Chorus (x2)"],
    ["(Chorus)", "Chorus"],
    ["*Chorus*", "Chorus"],
    ["**Bridge:**", "Bridge"],
    ["Refrain :", "Refrain"],
    ["Couplet 2 :", "Couplet 2"],
    ["Pont", "Pont"],
    ["Pré-refrain", "Pré-refrain"],
    ["Pre-Chorus", "Pre-Chorus"],
    ["Intro:", "Intro"],
    ["Outro", "Outro"],
    ["Solo guitare :", "Solo guitare"],
    ["Verse 1 (softly)", "Verse 1 (softly)"],
    ["Instrumental", "Instrumental"],
    ["Coda", "Coda"],
  ])("%s → %s", (line, label) => {
    expect(parseSectionHeader(line)).toBe(label);
  });

  it.each([
    "Endless love",
    "Introduction to the blues",
    "Solo in the dark tonight",
    "Chorus of angels singing",
    "A day in the life",
    "Am",
  ])("%s is not a header", (line) => {
    expect(parseSectionHeader(line)).toBeNull();
  });
});

describe("looksLikeChordPro", () => {
  it.each([
    ["inline chord", "[Am]Down the road"],
    ["chord-only line", "[Am] [F]"],
    ["multi-chord bracket", "Intro : [Dm F Am G]"],
    ["no chord", "[N.C.]"],
    ["annotation", "[*Coda]"],
  ])("%s", (_name, input) => {
    expect(looksLikeChordPro(input)).toBe(true);
  });

  it.each([
    ["plain chart", text("Am      F", "Down the road")],
    ["bracket section label", text("[Verse 1]", "Am", "Down the road")],
    ["bracket label with repeat", "[Chorus x2]"],
    ["directive without chords", text("{title: Song}", "Am", "Down the road")],
  ])("%s is not inline ChordPro", (_name, input) => {
    expect(looksLikeChordPro(input)).toBe(false);
  });
});

describe("expandTabs", () => {
  it("expands to the next 8-column tab stop", () => {
    expect(expandTabs("Am\tF")).toBe(`Am${" ".repeat(6)}F`);
    expect(expandTabs("\tG")).toBe(`${" ".repeat(8)}G`);
    expect(expandTabs("no tabs")).toBe("no tabs");
  });
});

describe("chordsOverLyricsToChordPro", () => {
  it.each([
    [
      "merges chords at their columns",
      text("Am            F", "Down the empty road again"),
      "[Am]Down the empty [F]road again",
    ],
    ["chord inside a word", text("    G", "Headlights"), "Head[G]lights"],
    [
      "chord past the end of the lyric is padded",
      text("C             G          Am", "Hold on"),
      "[C]Hold on [G] [Am]",
    ],
    ["lyric shorter than first chord column", text("          Em", "Oh"), "Oh [Em]"],
    [
      "multiple spaces in the lyric are kept",
      text("Am        F", "Hey   you  out there"),
      "[Am]Hey   you  [F]out there",
    ],
    [
      "chord line followed by a blank line stays chord-only",
      text("Am  F  C  G", "", "Down the road"),
      text("[Am] [F] [C] [G]", "", "Down the road"),
    ],
    [
      "two chord lines: first chord-only, second merged",
      text("Am  F", "C       G", "Down the road"),
      text("[Am] [F]", "[C]Down the [G]road"),
    ],
    [
      "chord line at the end of the text",
      text("Down the road", "Am  G"),
      text("Down the road", "[Am] [G]"),
    ],
    [
      "bars and beat slashes are dropped, repeat marks kept",
      "| Am / / / | F / / / | x2",
      "[Am] [F] [x2]",
    ],
    [
      "no chord and passing chord",
      text("N.C.       (Am)", "Stop right there"),
      "[N.C.]Stop right [Am]there",
    ],
    [
      "solfège chords become letters",
      text("Lam          Fa       Sol/Si", "Si tu savais combien"),
      "[Am]Si tu savais [F]combien [G/B]",
    ],
    [
      "chord over a space attaches to the next word",
      text("Am            F", "Down the empty road again"),
      "[Am]Down the empty [F]road again",
    ],
    [
      "two chords in the same gap do not collide",
      text("Am     F G", "Hey you      there"),
      "[Am]Hey you[F]      [G]there",
    ],
    ["sharps and flats symbols are normalized", text("F♯m   B♭", "Oh oh oh"), "[F#m]Oh oh [Bb]oh"],
    [
      "lyrics that start with chord-like words are left alone",
      text("A day in the life", "Am I wrong"),
      text("A day in the life", "Am I wrong"),
    ],
    [
      "a lyric line under a chord line is merged even if it starts with A",
      text("D            G", "A day in the life"),
      "[D]A day in the [G]life",
    ],
  ])("%s", (_name, input, expected) => {
    expect(chordsOverLyricsToChordPro(input)).toBe(expected);
  });

  it("turns section headers into bracket labels", () => {
    const input = text(
      "Verse 1:",
      "Am            F",
      "Down the empty road again",
      "",
      "CHORUS",
      "C         G",
      "Drive all night",
      "",
      "Couplet 2 :",
      "Am",
      "Encore la route",
      "",
      "(Refrain x2)",
    );
    expect(chordsOverLyricsToChordPro(input)).toBe(
      text(
        "[Verse 1]",
        "[Am]Down the empty [F]road again",
        "",
        "[CHORUS]",
        "[C]Drive all [G]night",
        "",
        "[Couplet 2]",
        "[Am]Encore la route",
        "",
        "[Refrain x2]",
      ),
    );
  });

  it("splits a header with chords on the same line", () => {
    expect(chordsOverLyricsToChordPro("Intro: Am  F  C  G")).toBe(
      text("[Intro]", "[Am] [F] [C] [G]"),
    );
    expect(chordsOverLyricsToChordPro("Solo  Em  D  (x2)")).toBe(text("[Solo]", "[Em] [D] [x2]"));
  });

  it("does not merge a chord line into a header, tab or directive below it", () => {
    expect(chordsOverLyricsToChordPro(text("Am  F", "Chorus:"))).toBe(text("[Am] [F]", "[Chorus]"));
    expect(chordsOverLyricsToChordPro(text("Am", "e|---0---|---1---|"))).toBe(
      text("[Am]", "{sot}", "e|---0---|---1---|", "{eot}"),
    );
  });

  it("wraps contiguous tab lines in {sot}/{eot}, keeping their spacing", () => {
    const input = text(
      "Riff:",
      "e|-----0---|",
      "B|---1-----|",
      "G|-2-------|",
      "",
      "  e|--3--|-----|",
      "  B|-----|--3--|",
      "Am",
      "Back to the verse",
    );
    expect(chordsOverLyricsToChordPro(input)).toBe(
      text(
        "[Riff]",
        "{sot}",
        "e|-----0---|",
        "B|---1-----|",
        "G|-2-------|",
        "{eot}",
        "",
        "{sot}",
        "  e|--3--|-----|",
        "  B|-----|--3--|",
        "{eot}",
        "[Am]Back to the verse",
      ),
    );
  });

  it("keeps blank lines and trims leading/trailing ones", () => {
    const input = text("", "", "Line one", "", "", "Line two", "", "");
    expect(chordsOverLyricsToChordPro(input)).toBe(text("Line one", "", "", "Line two"));
  });

  it("handles CRLF, BOM, non-breaking spaces and tabs", () => {
    const nbsp = " ";
    expect(chordsOverLyricsToChordPro(`\uFEFFAm${nbsp.repeat(4)}F\r\nHello world\r\n`)).toBe(
      "[Am]Hello [F]world",
    );
    expect(chordsOverLyricsToChordPro("Am\tF\nDown the road")).toBe("[Am]Down the [F]road");
  });

  it("keeps emoji and accents aligned (columns are code points)", () => {
    expect(chordsOverLyricsToChordPro(text("Am   F", "🎸éé là-bas"))).toBe("[Am]🎸éé l[F]à-bas");
  });

  it("returns text with inline chords untouched", () => {
    const chordPro = text("{title: Song}", "", "[Am]Down the [F]road", "Am     F", "plain line");
    expect(chordsOverLyricsToChordPro(chordPro)).toBe(chordPro);
  });

  it("converts the body of text that only has directives, leaving directives and tab blocks", () => {
    const input = text(
      "{title: Midnight Drive}",
      "{key: Am}",
      "",
      "{start_of_tab: Riff}",
      "Am   F",
      "e|---0---|",
      "{end_of_tab}",
      "",
      "Am            F",
      "Down the empty road again",
    );
    expect(chordsOverLyricsToChordPro(input)).toBe(
      text(
        "{title: Midnight Drive}",
        "{key: Am}",
        "",
        "{start_of_tab: Riff}",
        "Am   F",
        "e|---0---|",
        "{end_of_tab}",
        "",
        "[Am]Down the empty [F]road again",
      ),
    );
  });

  it("produces output the parser reads as sections, chords and tab", () => {
    const input = text(
      "[Intro]",
      "Em7  G  Dsus4  A7sus4",
      "",
      "[Verse 1]",
      "Em7            G",
      "Today is gonna be the day",
      "",
      "Pré-refrain :",
      "C         D",
      "And all the roads",
      "",
      "Solo:",
      "e|---0---3---|",
    );
    const song = parse(chordsOverLyricsToChordPro(input));
    expect(song.sections.map((s) => [s.type, s.label])).toEqual([
      ["intro", "Intro"],
      ["verse", "Verse 1"],
      ["pré-refrain", "Pré-refrain"],
      ["solo", "Solo"],
      ["tab", undefined],
    ]);
    const verse = song.sections[1].lines[0];
    expect(verse.kind === "lyric" && verse.segments.map((s) => [s.chord, s.text])).toEqual([
      ["Em7", "Today is gonna "],
      ["G", "be the day"],
    ]);
    expect(song.sections[4].renderMode).toBe("monospace");
  });
});
