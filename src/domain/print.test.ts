import type { Song } from "@db";
import {
  buildPrintSetlist,
  estimateSheetHeight,
  formatSetlistDate,
  playedKey,
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
