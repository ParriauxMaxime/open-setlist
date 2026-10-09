import { parse } from "../chordpro/parser";
import {
  CHART_INSERT_MODES,
  chartHasLyrics,
  convertChartText,
  extractChartMetadata,
  insertChart,
} from "./chart-text";

const text = (...lines: string[]) => lines.join("\n");

describe("extractChartMetadata", () => {
  it.each([
    [
      "Title - Artist, then key/capo/tempo on one line",
      text("Midnight Drive - The Signals", "Key: Am   Capo 2   Tempo 120", "", "Am", "Down"),
      { title: "Midnight Drive", artist: "The Signals", key: "Am", capo: "2", bpm: "120" },
    ],
    [
      "title alone followed by a blank line",
      text("Stand By Me", "", "A          F#m", "When the night"),
      { title: "Stand By Me" },
    ],
    [
      "Ultimate Guitar style title",
      text("Wonderwall Chords by Oasis", "", "[Intro]"),
      { title: "Wonderwall", artist: "Oasis" },
    ],
    [
      "en dash separator",
      text("Café Noir – Les Ondes", ""),
      { title: "Café Noir", artist: "Les Ondes" },
    ],
    [
      "labeled fields",
      text("Title: Night Train", "Artist: The Signals", "Key: F#m", "BPM: 96"),
      { title: "Night Train", artist: "The Signals", key: "F#m", bpm: "96" },
    ],
    [
      "French header with solfège key",
      text("Le Chemin - Les Voisins", "Tonalité : Rém", "Capo 3e case", "", "Rém"),
      { title: "Le Chemin", artist: "Les Voisins", key: "Dm", capo: "3" },
    ],
    [
      "separate lines, other header lines skipped",
      text(
        "Riverside",
        "Tuning: E A D G B E",
        "Key: Bb major",
        "Capo: 2nd fret",
        "120 bpm",
        "",
        "Bb",
      ),
      { title: "Riverside", key: "Bb", capo: "2", bpm: "120" },
    ],
    ["key of", text("Key of G", "", "G"), { key: "G" }],
    ["A minor spelled out", text("Key: A minor"), { key: "Am" }],
  ])("%s", (_name, input, expected) => {
    expect(extractChartMetadata(input).metadata).toEqual(expected);
  });

  it.each([
    ["chart starting with chords", text("Am      F", "Down the road")],
    ["chart starting with a section", text("[Verse 1]", "Am", "Down the road")],
    [
      "first lyric line followed by a chord line",
      text("Stand by me", "A        F#m", "oh darling"),
    ],
    ["unparseable key", text("Key: blue", "", "Am")],
    ["tempo mention in a sentence", text("Play it at tempo 120 please", "Am", "la")],
  ])("leaves %s alone", (_name, input) => {
    expect(extractChartMetadata(input)).toEqual({ metadata: {}, body: input });
  });

  it("a set-apart first line is a title even if it contains 'key'", () => {
    expect(extractChartMetadata(text("Key to my heart", "", "Am")).metadata).toEqual({
      title: "Key to my heart",
    });
  });

  it("removes only the header lines from the body", () => {
    const input = text("Song - Band", "Key: C", "Tuning: Drop D", "", "C", "Hello");
    expect(extractChartMetadata(input).body).toBe(text("Tuning: Drop D", "", "C", "Hello"));
  });

  it("only reads the header: metadata-looking lines after the first chord stay", () => {
    const input = text("Am", "Down the road", "Capo 2");
    expect(extractChartMetadata(input)).toEqual({ metadata: {}, body: input });
  });
});

describe("convertChartText", () => {
  it("adds directives for the header and converts the body", () => {
    const input = text(
      "Midnight Drive - The Signals",
      "Key: Am  Capo 2",
      "",
      "Verse 1:",
      "Am            F",
      "Down the empty road again",
    );
    expect(convertChartText(input)).toEqual({
      alreadyChordPro: false,
      content: text(
        "{title: Midnight Drive}",
        "{artist: The Signals}",
        "{key: Am}",
        "{capo: 2}",
        "",
        "[Verse 1]",
        "[Am]Down the empty [F]road again",
      ),
    });
  });

  it("keeps ChordPro as is", () => {
    const chordPro = text("{title: Song}", "{key: C}", "", "[C]Hello [G]world");
    expect(convertChartText(`\n${chordPro}\n`)).toEqual({
      content: chordPro,
      alreadyChordPro: true,
    });
  });

  it("converts only the body when the text already has directives", () => {
    const input = text(
      "{title: Song}",
      "Not a title - Not an artist",
      "",
      "C     G",
      "Hello world",
    );
    expect(convertChartText(input).content).toBe(
      text("{title: Song}", "Not a title - Not an artist", "", "[C]Hello [G]world"),
    );
  });

  it("parses back to the extracted metadata", () => {
    const { content } = convertChartText(text("Song - Band", "Tempo 100", "", "G", "Hi"));
    expect(parse(content).metadata).toEqual({ title: "Song", artist: "Band", bpm: "100" });
  });
});

describe("chartHasLyrics", () => {
  it.each([
    ["", false],
    ["{title: Song}\n{key: C}\n\n", false],
    ["{title: Song}\n{c: 12B}", false],
    ["{title: Song}\n\n[C]Hello", true],
    ["Hello", true],
  ])("%j → %s", (content, expected) => {
    expect(chartHasLyrics(content)).toBe(expected);
  });
});

describe("insertChart", () => {
  const chart = text(
    "{title: Pasted}",
    "{artist: Band}",
    "{key: Am}",
    "{capo: 2}",
    "",
    "[Am]Hello",
  );

  it("fills an empty editor with the whole chart", () => {
    expect(insertChart("", chart, CHART_INSERT_MODES.append)).toBe(chart);
  });

  it("keeps existing metadata and only adds what is missing", () => {
    const existing = text("{title: Mine}", "{key: C}", "{bpm: 90}");
    expect(insertChart(existing, chart, CHART_INSERT_MODES.append)).toBe(
      text(
        "{title: Mine}",
        "{key: C}",
        "{bpm: 90}",
        "{artist: Band}",
        "{capo: 2}",
        "",
        "[Am]Hello",
      ),
    );
  });

  it("does not overwrite form fields that are filled but not in the content", () => {
    const result = insertChart("", chart, CHART_INSERT_MODES.append, { title: "Typed", bpm: 120 });
    expect(parse(result).metadata).toEqual({ artist: "Band", key: "Am", capo: "2" });
  });

  it("treats an empty bpm field (NaN) as not filled", () => {
    const tempoChart = text("{bpm: 100}", "", "Hi");
    expect(insertChart("", tempoChart, CHART_INSERT_MODES.append, { bpm: Number.NaN })).toBe(
      text("{bpm: 100}", "", "Hi"),
    );
  });

  it("replace keeps the song details and swaps the chart", () => {
    const existing = text(
      "{title: Mine}",
      "{key: C}",
      "{tags: rock}",
      "",
      "{c: 12B}",
      "{start_of_verse}",
      "[C]Old words",
      "{end_of_verse}",
    );
    expect(insertChart(existing, chart, CHART_INSERT_MODES.replace)).toBe(
      text(
        "{title: Mine}",
        "{key: C}",
        "{tags: rock}",
        "{artist: Band}",
        "{capo: 2}",
        "",
        "[Am]Hello",
      ),
    );
  });

  it("append keeps everything and adds the chart at the end", () => {
    const existing = text("{title: Mine}", "", "[C]Old words", "");
    expect(insertChart(existing, text("[G]New words"), CHART_INSERT_MODES.append)).toBe(
      text("{title: Mine}", "", "[C]Old words", "", "[G]New words"),
    );
  });

  it("uses the Setlist Helper {st} as artist and does not duplicate aliases", () => {
    const shChart = text("{t: Pasted}", "{st: Band}", "{tempo: 100}", "", "Hi");
    expect(insertChart("{title: Mine}", shChart, CHART_INSERT_MODES.append)).toBe(
      text("{title: Mine}", "{artist: Band}", "{bpm: 100}", "", "Hi"),
    );
  });
});
