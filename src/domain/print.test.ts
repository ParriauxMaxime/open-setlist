import type { Song } from "@db";
import { transposeChord } from "./chords/transpose";
import {
  buildPrintSetlist,
  estimateSheetHeight,
  formatSetlistDate,
  type PrintSong,
  parsePrintPart,
  playedKey,
  printPartChoices,
  printPartView,
  SHEET_ROWS_HEIGHT_PT,
  SHEET_TITLE_MAX_PT,
  SHEET_TITLE_MIN_PT,
  type SheetRow,
  sheetTitleSize,
} from "./print";

function song(id: string, extra: Partial<Song> = {}): Song {
  return {
    id,
    title: id,
    tags: [],
    content: "",
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function rows(count: number, title = "Wonderwall", hasSetup = false): SheetRow[] {
  return Array.from({ length: count }, () => ({ title, hasSetup }));
}

describe("playedKey", () => {
  it("returns the key untouched without transposition", () => {
    expect(playedKey({ key: "Em" })).toBe("Em");
    expect(playedKey({ key: "Em", transposition: 0 })).toBe("Em");
  });

  it("applies the song's transposition", () => {
    expect(playedKey({ key: "G", transposition: 2 })).toBe("A");
    expect(playedKey({ key: "Am", transposition: -2 })).toBe("Gm");
  });

  it("is undefined without a key", () => {
    expect(playedKey({ transposition: 3 })).toBeUndefined();
  });

  it("adds a part's written-pitch shift", () => {
    expect(playedKey({ key: "Gm" }, 2)).toBe("Am");
    expect(playedKey({ key: "Gm", transposition: 2 }, 2)).toBe("Bm");
    expect(playedKey({ key: "Modal" }, 2)).toBe("Modal");
  });
});

describe("buildPrintSetlist", () => {
  const songs = new Map<string, Song>([
    ["a", song("a", { duration: 180, content: "{c: 12B Strat}\n[G]Hello" })],
    ["b", song("b", { duration: 240, key: "C", transposition: 2 })],
    ["c", song("c")],
  ]);

  it("numbers songs continuously across sets", () => {
    const result = buildPrintSetlist(
      {
        sets: [
          { name: "Set 1", songIds: ["a", "b"] },
          { name: "Set 2", songIds: ["c", "a"] },
        ],
      },
      songs,
    );
    expect(result.sets.map((s) => s.songs.map((p) => [p.number, p.song.id]))).toEqual([
      [
        [1, "a"],
        [2, "b"],
      ],
      [
        [3, "c"],
        [4, "a"],
      ],
    ]);
    expect(result.songCount).toBe(4);
  });

  it("computes set and total durations, counting songs without one", () => {
    const result = buildPrintSetlist(
      {
        sets: [
          { name: "Set 1", songIds: ["a", "b"] },
          { name: "Set 2", songIds: ["c", "a"] },
        ],
      },
      songs,
    );
    expect(result.sets.map((s) => [s.duration, s.unknownDurationCount])).toEqual([
      [420, 0],
      [180, 1],
    ]);
    expect(result.duration).toBe(600);
    expect(result.unknownDurationCount).toBe(1);
  });

  it("skips missing songs and sets left empty", () => {
    const result = buildPrintSetlist(
      {
        sets: [
          { name: "Set 1", songIds: ["gone"] },
          { name: "Set 2", songIds: [] },
          { name: "Encore", songIds: ["gone", "c"] },
        ],
      },
      songs,
    );
    expect(result.sets).toHaveLength(1);
    expect(result.sets[0].name).toBe("Encore");
    expect(result.sets[0].songs[0].number).toBe(1);
    expect(result.songCount).toBe(1);
  });

  it("parses the chart and exposes the setup line and played key", () => {
    const result = buildPrintSetlist({ sets: [{ name: "Set 1", songIds: ["a", "b"] }] }, songs);
    const [a, b] = result.sets[0].songs;
    expect(a.chart.setup).toBe("12B Strat");
    expect(b.key).toBe("D");
  });

  it("handles an empty setlist", () => {
    expect(buildPrintSetlist({ sets: [{ name: "Set 1", songIds: [] }] }, songs)).toEqual({
      sets: [],
      songCount: 0,
      duration: 0,
      unknownDurationCount: 0,
    });
  });

  it("keeps the chart whole and the song's transposition without a part", () => {
    const result = buildPrintSetlist({ sets: [{ name: "Set 1", songIds: ["a", "b"] }] }, songs);
    const [a, b] = result.sets[0].songs;
    expect(a.transposition).toBe(0);
    expect(b.transposition).toBe(2);
  });
});

describe("print for one part", () => {
  const GM_CHART = [
    "{key: Gm}",
    "{start_of_verse}",
    "[Gm]Hello [Bb]there [D7]my [Eb]friend",
    "{end_of_verse}",
    "{comment: Palm mute, for=guitar}",
    "{comment: Everyone louder}",
    "{start_of_tab: Horn line, for=trumpet}",
    "G A Bb",
    "{end_of_tab}",
  ].join("\n");

  const songs = new Map<string, Song>([
    ["gm", song("gm", { key: "Gm", content: GM_CHART })],
    ["up", song("up", { key: "Gm", transposition: 2, content: GM_CHART })],
    ["capo", song("capo", { key: "G", content: "{key: G}\n{capo: 2}\n[G]Hi [D]there" })],
  ]);

  function printed(songId: string, part?: string): PrintSong {
    const result = buildPrintSetlist(
      { sets: [{ name: "Set", songIds: [songId] }] },
      songs,
      undefined,
      part,
    );
    return result.sets[0].songs[0];
  }

  /** Chords as PrintChart renders them: shifted, spelled for the written key. */
  function chords(entry: PrintSong): string[] {
    return entry.chart.sections.flatMap((section) =>
      section.lines.flatMap((line) =>
        line.kind === "lyric"
          ? line.segments.flatMap((s) =>
              s.chord
                ? [transposeChord(s.chord, entry.transposition, entry.chart.metadata.key)]
                : [],
            )
          : [],
      ),
    );
  }

  function comments(entry: PrintSong): string[] {
    return entry.chart.sections.flatMap((section) =>
      section.lines.flatMap((line) => (line.kind === "comment" ? [line.text] : [])),
    );
  }

  it("prints concert Gm for a B♭ trumpet in Am", () => {
    const entry = printed("gm", "trumpet");
    expect(entry.key).toBe("Am");
    expect(entry.transposition).toBe(2);
    expect(chords(entry)).toEqual(["Am", "C", "E7", "F"]);
  });

  it("prints concert Gm for an E♭ alto sax in Em", () => {
    const entry = printed("gm", "alto-sax");
    expect(entry.key).toBe("Em");
    expect(entry.transposition).toBe(9);
    expect(chords(entry)).toEqual(["Em", "G", "B7", "C"]);
  });

  it("adds the written pitch on top of the song's transposition", () => {
    // Gm played up 2 (concert Am): the trumpet reads Bm
    const entry = printed("up", "trumpet");
    expect(entry.key).toBe("Bm");
    expect(entry.transposition).toBe(4);
    expect(chords(entry)).toEqual(["Bm", "D", "F#7", "G"]);
  });

  it("reads capo charts from the sounding key", () => {
    // G shapes, capo 2: the band sounds A, the trumpet reads B
    const entry = printed("capo", "trumpet");
    expect(entry.key).toBe("B");
    expect(chords(entry)).toEqual(["B", "F#"]);
  });

  it("leaves concert-pitch parts in concert pitch", () => {
    const entry = printed("gm", "guitar");
    expect(entry.key).toBe("Gm");
    expect(entry.transposition).toBe(0);
    expect(chords(entry)).toEqual(["Gm", "Bb", "D7", "Eb"]);
  });

  it("keeps the part's sections and every band cue", () => {
    const trumpet = printed("gm", "trumpet");
    expect(trumpet.chart.sections.map((s) => s.label)).toContain("Horn line");
    expect(comments(trumpet)).toEqual(["Everyone louder"]);

    const guitar = printed("gm", "guitar");
    expect(guitar.chart.sections.map((s) => s.label)).not.toContain("Horn line");
    expect(comments(guitar)).toEqual(["Palm mute", "Everyone louder"]);
  });

  it("formats the written key with the key label", () => {
    const result = buildPrintSetlist(
      { sets: [{ name: "Set", songIds: ["gm"] }] },
      songs,
      (key) => `<${key}>`,
      "trumpet",
    );
    expect(result.sets[0].songs[0].key).toBe("<Am>");
  });

  it("builds the part view: the part, cues and chords, written pitch", () => {
    expect(printPartView("trumpet")).toEqual({
      instrument: "trumpet",
      showCues: true,
      showChords: true,
      writtenPitch: true,
    });
  });
});

describe("parsePrintPart", () => {
  it("normalizes the part, synonyms included", () => {
    expect(parsePrintPart("trumpet")).toBe("trumpet");
    expect(parsePrintPart("Trompette")).toBe("trumpet");
    expect(parsePrintPart("🎺")).toBe("trumpet");
    expect(parsePrintPart(" Sax-Alto ")).toBe("alto-sax");
  });

  it("keeps unknown parts as-is (lowercased)", () => {
    expect(parsePrintPart("Accordion")).toBe("accordion");
  });

  it("means every part when missing, blank or all", () => {
    expect(parsePrintPart(undefined)).toBeUndefined();
    expect(parsePrintPart("")).toBeUndefined();
    expect(parsePrintPart("  ")).toBeUndefined();
    expect(parsePrintPart("all")).toBeUndefined();
    expect(parsePrintPart("ALL")).toBeUndefined();
  });
});

describe("printPartChoices", () => {
  it("lists the songs' parts and the extra ones, sorted and de-duplicated", () => {
    const songs = [
      { content: "{start_of_tab: Solo, for=gtr}\ne|--|\n{end_of_tab}" },
      { content: "[G]Intro\n{comment: Mute, for=Trompette}\n{comment: Brushes, for=drums}" },
      { content: "[G]No parts here" },
    ];
    expect(printPartChoices(songs, ["guitar", "Accordion", undefined, "all"])).toEqual([
      "guitar",
      "drums",
      "trumpet",
      "accordion",
    ]);
  });

  it("is empty without parts", () => {
    expect(printPartChoices([], [undefined, "all"])).toEqual([]);
  });
});

describe("sheetTitleSize", () => {
  it("uses the maximum size for short sets", () => {
    expect(sheetTitleSize([])).toBe(SHEET_TITLE_MAX_PT);
    expect(sheetTitleSize(rows(5))).toBe(SHEET_TITLE_MAX_PT);
  });

  it("shrinks as the set grows, never growing back", () => {
    let previous = SHEET_TITLE_MAX_PT;
    for (let count = 1; count <= 40; count++) {
      const size = sheetTitleSize(rows(count));
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
    expect(sheetTitleSize(rows(20))).toBeLessThan(SHEET_TITLE_MAX_PT);
  });

  it("falls back to the minimum when a set cannot fit one page", () => {
    expect(sheetTitleSize(rows(60))).toBe(SHEET_TITLE_MIN_PT);
  });

  it("returns a size whose estimated height fits the page", () => {
    for (const count of [8, 12, 16, 20, 25]) {
      const r = rows(count, "Sweet Child O' Mine", true);
      const size = sheetTitleSize(r);
      if (size > SHEET_TITLE_MIN_PT) {
        expect(estimateSheetHeight(r, size)).toBeLessThanOrEqual(SHEET_ROWS_HEIGHT_PT);
        expect(estimateSheetHeight(r, size + 1)).toBeGreaterThan(SHEET_ROWS_HEIGHT_PT);
      }
    }
  });

  it("goes smaller for long titles and setup lines", () => {
    const base = sheetTitleSize(rows(14, "Zombie"));
    expect(sheetTitleSize(rows(14, "Take Me Home, Country Roads (Live Version)"))).toBeLessThan(
      base,
    );
    expect(sheetTitleSize(rows(14, "Zombie", true))).toBeLessThan(base);
  });
});

describe("formatSetlistDate", () => {
  it("formats an ISO date in the given locale without shifting the day", () => {
    expect(formatSetlistDate("2026-03-08", "en")).toBe("Sunday, March 8, 2026");
    expect(formatSetlistDate("2026-03-08", "fr")).toBe("dimanche 8 mars 2026");
  });

  it("returns other input untouched", () => {
    expect(formatSetlistDate("next friday", "en")).toBe("next friday");
  });
});
