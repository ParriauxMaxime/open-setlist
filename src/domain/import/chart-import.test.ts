import type { Song } from "@db/song";
import { CHART_FILE_WARNING_CODES, type ImportedChart } from "./chart-files";
import {
  buildChartImportWrites,
  CHART_SKIP_REASON,
  isSameSong,
  planChartImport,
  replaceWithChart,
  summarizeChartImport,
} from "./chart-import";

const CHART = "{start_of_verse}\n[Am]Down the empty road\n{end_of_verse}";

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: "s1",
    title: "Midnight Drive",
    artist: "The Signals",
    tags: [],
    content: CHART,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function chart(
  overrides: Partial<ImportedChart["song"]> = {},
  file = "midnight.cho",
): ImportedChart {
  return {
    row: 1,
    file,
    converted: false,
    song: {
      title: "Midnight Drive",
      artist: "The Signals",
      tags: [],
      content: `{title: Midnight Drive}\n${CHART}\n[C]New line`,
      ...overrides,
    },
  };
}

describe("isSameSong", () => {
  it("matches title and artist whatever the case and accents", () => {
    expect(
      isSameSong({ title: "Café Noir", artist: "ÉTÉ" }, { title: "cafe noir", artist: "ete" }),
    ).toBe(true);
  });

  it("tells songs of other artists apart", () => {
    expect(isSameSong({ title: "Home", artist: "A" }, { title: "Home", artist: "B" })).toBe(false);
  });

  it("treats a missing artist as empty", () => {
    expect(isSameSong({ title: "Home" }, { title: "home", artist: "" })).toBe(true);
  });
});

describe("planChartImport", () => {
  it("sorts new songs, songs without a chart and songs with one", () => {
    const catalog = [
      song({ id: "with-chart" }),
      song({ id: "no-chart", title: "Empty One", content: "{title: Empty One}" }),
    ];
    const plan = planChartImport(
      [chart(), chart({ title: "EMPTY ONE" }), chart({ title: "Brand New" })],
      catalog,
    );
    expect(plan.matches.map((m) => m.existing.id)).toEqual(["with-chart"]);
    expect(plan.fills.map((m) => m.existing.id)).toEqual(["no-chart"]);
    expect(plan.newSongs.map((m) => m.song.title)).toEqual(["Brand New"]);
  });
});

describe("replaceWithChart", () => {
  const existing = song({
    id: "keep-me",
    status: "rehearsing",
    patches: { keys: "12" },
    scrollSpeed: 4,
    links: { youtube: "https://youtu.be/mine" },
    key: "Am",
    bpm: 100,
    tags: ["rock"],
    notes: "my notes",
    attachments: [{ id: "f1", name: "score.pdf", type: "application/pdf", size: 10 }],
    createdAt: 5,
  });

  it("keeps the band's settings and overwrites the chart and details from the file", () => {
    const result = replaceWithChart(
      existing,
      chart({
        key: "C",
        bpm: 120,
        tags: ["pop"],
        scrollSpeed: 9,
        links: { youtube: "https://youtu.be/file" },
      }).song,
      42,
    );
    expect(result).toMatchObject({
      id: "keep-me",
      createdAt: 5,
      updatedAt: 42,
      status: "rehearsing",
      patches: { keys: "12" },
      scrollSpeed: 4,
      links: { youtube: "https://youtu.be/mine" },
      key: "C",
      bpm: 120,
      tags: ["pop"],
      content: chart().song.content,
    });
    expect(result.attachments).toHaveLength(1);
  });

  it("keeps the details the file has no value for", () => {
    const result = replaceWithChart(existing, chart().song, 42);
    expect(result).toMatchObject({ key: "Am", bpm: 100, tags: ["rock"], notes: "my notes" });
  });

  it("takes the file's scroll speed and links when the song had none", () => {
    const result = replaceWithChart(
      song(),
      chart({ scrollSpeed: 6, links: { youtube: "https://youtu.be/file" } }).song,
      42,
    );
    expect(result.scrollSpeed).toBe(6);
    expect(result.links).toEqual({ youtube: "https://youtu.be/file" });
  });
});

describe("buildChartImportWrites", () => {
  const plan = planChartImport(
    [chart(), chart({ title: "Brand New" })],
    [song({ id: "existing" })],
  );

  it("adds new songs and leaves existing ones when skipping", () => {
    const writes = buildChartImportWrites(plan, false, 7, () => "new-id");
    expect(writes.added.map((s) => [s.id, s.title, s.createdAt])).toEqual([
      ["new-id", "Brand New", 7],
    ]);
    expect(writes.updated).toEqual([]);
  });

  it("replaces existing songs in place, never adding a duplicate", () => {
    const writes = buildChartImportWrites(plan, true, 7, () => "new-id");
    expect(writes.added).toHaveLength(1);
    expect(writes.updated.map((s) => s.id)).toEqual(["existing"]);
  });
});

describe("summarizeChartImport", () => {
  it("lists what was left out and why, apart from the notes", () => {
    const plan = planChartImport([chart()], [song()]);
    const summary = summarizeChartImport(
      { added: [], updated: [] },
      [
        { file: "notes.pdf", code: CHART_FILE_WARNING_CODES.unsupportedFile },
        { file: "blank.txt", code: CHART_FILE_WARNING_CODES.emptyFile },
        { file: "a.cho", code: CHART_FILE_WARNING_CODES.unparseableKey, value: "H" },
      ],
      plan.matches,
    );
    expect(summary.skipped).toEqual([
      { file: "notes.pdf", reason: CHART_SKIP_REASON.notAChart },
      { file: "blank.txt", reason: CHART_SKIP_REASON.emptyFile },
      { file: "midnight.cho", title: "Midnight Drive", reason: CHART_SKIP_REASON.alreadyInCatalog },
    ]);
    expect(summary.notes.map((n) => n.code)).toEqual([CHART_FILE_WARNING_CODES.unparseableKey]);
  });
});
