import type { Setlist } from "@db/setlist";
import type { Song } from "@db/song";
import { SetlistHelperFormatError } from "./setlist-helper";
import {
  buildSetlistImportWrites,
  FIRST_SET_NAME,
  type ParsedSetlistFile,
  parseSetlistHelperSetlistCsv,
  planSetlistFile,
  setlistNameFromFileName,
  UNMATCHED_ACTIONS,
  uniqueSetlistName,
} from "./setlist-helper-setlist";

// ---------------------------------------------------------------------------
// Synthetic fixture helpers
// ---------------------------------------------------------------------------

const HEADER = [
  "SequenceNumber",
  "Name",
  "GenreName",
  "ArtistName",
  "Key",
  "Notes",
  "Lyrics",
  "Tempo",
  "SongLength",
  "Other",
];

type Row = Partial<Record<(typeof HEADER)[number], string>>;

function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

function buildCsv(rows: Row[]): string {
  const lines = [HEADER.join(",")];
  for (const row of rows) lines.push(HEADER.map((h) => quote(row[h] ?? "")).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

function utf16le(text: string): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}

function song(id: string, title: string, artist?: string, createdAt = 1): Song {
  return { id, title, artist, tags: [], content: "", createdAt, updatedAt: createdAt };
}

function setlist(name: string): Setlist {
  return { id: name, name, sets: [], createdAt: 1, updatedAt: 1 };
}

function sequentialIds() {
  let n = 0;
  return () => `new-${++n}`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe("parseSetlistHelperSetlistCsv", () => {
  it("reads a UTF-16LE file with BOM, quotes and empty Lyrics", () => {
    const { entries, warnings } = parseSetlistHelperSetlistCsv(
      utf16le(
        buildCsv([
          {
            SequenceNumber: "1",
            Name: 'Chanson, "première"',
            ArtistName: "Les Fictifs",
            GenreName: "Pop",
            Key: "RÉm",
            Tempo: "98",
            SongLength: "3:05",
            Notes: "Capo 2, intro x2",
            Other: "Lead: Bob",
          },
        ]),
      ),
    );
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].song).toMatchObject({
      title: 'Chanson, "première"',
      artist: "Les Fictifs",
      tags: ["Pop"],
      key: "Dm",
      bpm: 98,
      duration: 185,
      notes: "Capo 2, intro x2\nLead: Bob",
    });
    // Metadata header only, no chart body.
    expect(entries[0].song.content).not.toContain("\n\n");
    expect(entries[0].song.content).toContain("{key: Dm}");
  });

  it("orders entries by SequenceNumber even when rows are shuffled", () => {
    const { entries } = parseSetlistHelperSetlistCsv(
      utf16le(
        buildCsv([
          { SequenceNumber: "3", Name: "Gamma" },
          { SequenceNumber: "1", Name: "Alpha" },
          { SequenceNumber: "10", Name: "Delta" },
          { SequenceNumber: "2", Name: "Beta" },
        ]),
      ),
    );
    expect(entries.map((e) => e.song.title)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(entries.map((e) => e.row)).toEqual([2, 4, 1, 3]);
  });

  it("puts rows with an invalid sequence last, with a warning", () => {
    const { entries, warnings } = parseSetlistHelperSetlistCsv(
      buildCsv([
        { SequenceNumber: "x", Name: "Late" },
        { SequenceNumber: "2", Name: "Second" },
        { SequenceNumber: "1", Name: "First" },
      ]),
    );
    expect(entries.map((e) => e.song.title)).toEqual(["First", "Second", "Late"]);
    expect(warnings).toEqual([{ row: 1, code: "invalidSequence", title: "Late", value: "x" }]);
  });

  it("decodes HTML entities", () => {
    const { entries } = parseSetlistHelperSetlistCsv(
      utf16le(
        buildCsv([
          {
            SequenceNumber: "1",
            Name: "Caf&#233; &amp; Cr&#xE8;me",
            ArtistName: "L&#39;Orchestre",
            GenreName: "Vari&#233;t&#233;",
          },
        ]),
      ),
    );
    expect(entries[0].song).toMatchObject({
      title: "Café & Crème",
      artist: "L'Orchestre",
      tags: ["Variété"],
    });
  });

  it("keeps the first occurrence of a song listed twice", () => {
    const { entries, warnings } = parseSetlistHelperSetlistCsv(
      buildCsv([
        { SequenceNumber: "2", Name: "Refrain", ArtistName: "Band" },
        { SequenceNumber: "1", Name: "refrain", ArtistName: "band" },
      ]),
    );
    expect(entries.map((e) => e.row)).toEqual([2]);
    expect(warnings).toEqual([{ row: 1, code: "duplicateInFile", title: "Refrain" }]);
  });

  it("skips rows without a title", () => {
    const { entries, warnings } = parseSetlistHelperSetlistCsv(
      buildCsv([{ SequenceNumber: "1" }, { SequenceNumber: "2", Name: "Ok" }]),
    );
    expect(entries.map((e) => e.song.title)).toEqual(["Ok"]);
    expect(warnings).toEqual([{ row: 1, code: "missingTitle" }]);
  });

  it("rejects a catalog export (no SequenceNumber)", () => {
    expect(() => parseSetlistHelperSetlistCsv("Name,Lyrics\r\nA,\r\n")).toThrow(
      SetlistHelperFormatError,
    );
  });
});

describe("setlistNameFromFileName", () => {
  it("drops the extension and underscores", () => {
    expect(setlistNameFromFileName("Summer_Gig_2026.csv")).toBe("Summer Gig 2026");
    expect(setlistNameFromFileName("  Club - night .CSV")).toBe("Club - night");
    expect(setlistNameFromFileName("v1.2 set.csv")).toBe("v1.2 set");
    expect(setlistNameFromFileName(".csv")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const parsedFrom = (rows: Row[]): ParsedSetlistFile => parseSetlistHelperSetlistCsv(buildCsv(rows));

describe("planSetlistFile", () => {
  it("matches accent- and case-insensitively on title + artist", () => {
    const parsed = parsedFrom([
      { SequenceNumber: "1", Name: "ETE INDIEN", ArtistName: "les synthetiques" },
      { SequenceNumber: "2", Name: "Inconnue", ArtistName: "Personne" },
      { SequenceNumber: "3", Name: "Été indien", ArtistName: "Autre groupe" },
    ]);
    const plan = planSetlistFile(parsed, [song("a", "Été Indien", "Les Synthétiques")]);
    expect(plan.entries.map((e) => e.existing?.id)).toEqual(["a", undefined, undefined]);
    expect(plan).toMatchObject({ matched: 1, unmatched: 2, warnings: [] });
  });

  it("picks the oldest catalog duplicate deterministically and warns", () => {
    const parsed = parsedFrom([{ SequenceNumber: "1", Name: "Twin", ArtistName: "Band" }]);
    const catalog = [
      song("z", "Twin", "Band", 5),
      song("b", "twin", "band", 2),
      song("a", "TWIN", "BAND", 2),
    ];
    const plan = planSetlistFile(parsed, catalog);
    const reversed = planSetlistFile(parsed, [...catalog].reverse());
    expect(plan.entries[0].existing?.id).toBe("a");
    expect(reversed.entries[0].existing?.id).toBe("a");
    expect(plan.warnings).toEqual([{ row: 1, code: "ambiguousMatch", title: "Twin", value: "3" }]);
  });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe("buildSetlistImportWrites", () => {
  const catalog = [song("known", "Known Song", "Band")];
  const parsed = parsedFrom([
    { SequenceNumber: "2", Name: "Known Song", ArtistName: "Band" },
    { SequenceNumber: "1", Name: "New Song", ArtistName: "Band", Key: "Bb", Tempo: "100" },
    { SequenceNumber: "3", Name: "Other New", SongLength: "4:00", GenreName: "Rock" },
  ]);

  it("creates stub songs for unmatched rows and keeps sequence order", () => {
    const writes = buildSetlistImportWrites(
      [{ name: "Gig", date: "2026-11-01", venue: " Club ", parsed }],
      catalog,
      [],
      UNMATCHED_ACTIONS.create,
      1000,
      sequentialIds(),
    );
    expect(writes.songs).toHaveLength(2);
    expect(writes.songs[0]).toMatchObject({
      id: "new-1",
      title: "New Song",
      artist: "Band",
      key: "Bb",
      bpm: 100,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(writes.songs[1]).toMatchObject({ title: "Other New", duration: 240, tags: ["Rock"] });
    expect(writes.setlists).toEqual([
      {
        id: "new-3",
        name: "Gig",
        date: "2026-11-01",
        venue: "Club",
        sets: [{ name: FIRST_SET_NAME, songIds: ["new-1", "known", "new-2"] }],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);
  });

  it("drops unmatched rows when asked to skip", () => {
    const writes = buildSetlistImportWrites(
      [{ name: "Gig", date: "", venue: "", parsed }],
      catalog,
      [],
      UNMATCHED_ACTIONS.skip,
      1000,
      sequentialIds(),
    );
    expect(writes.songs).toEqual([]);
    expect(writes.setlists[0]).toMatchObject({ date: undefined, venue: undefined });
    expect(writes.setlists[0].sets[0].songIds).toEqual(["known"]);
  });

  it("creates a stub once when it appears in several files", () => {
    const writes = buildSetlistImportWrites(
      [
        { name: "A", parsed },
        { name: "B", parsed },
      ],
      catalog,
      [],
      UNMATCHED_ACTIONS.create,
      1000,
      sequentialIds(),
    );
    expect(writes.songs).toHaveLength(2);
    expect(writes.setlists[0].sets[0].songIds).toEqual(writes.setlists[1].sets[0].songIds);
  });

  it("never reuses an existing setlist name, including within the batch", () => {
    const writes = buildSetlistImportWrites(
      [
        { name: "Gig", parsed },
        { name: " gig ", parsed },
        { name: "Fresh", parsed },
      ],
      catalog,
      [setlist("GIG"), setlist("Gig (2)")],
      UNMATCHED_ACTIONS.skip,
      1000,
      sequentialIds(),
    );
    expect(writes.setlists.map((s) => s.name)).toEqual(["Gig (3)", "gig (4)", "Fresh"]);
  });
});

describe("uniqueSetlistName", () => {
  it("returns the name unchanged when free", () => {
    expect(uniqueSetlistName("Gig", new Set(["other"]))).toBe("Gig");
  });

  it("suffixes the first free number", () => {
    expect(uniqueSetlistName("Gig", new Set(["gig"]))).toBe("Gig (2)");
    expect(uniqueSetlistName("Gig", new Set(["gig", "gig (2)", "gig (3)"]))).toBe("Gig (4)");
  });
});
