import type { Song } from "@db/song";
import { parse } from "../chordpro/parser";
import {
  buildImportWrites,
  type ImportedSong,
  parseSetlistHelperCsv,
  planImport,
  SetlistHelperFormatError,
  songMatchKey,
} from "./setlist-helper";

// ---------------------------------------------------------------------------
// Synthetic fixture helpers
// ---------------------------------------------------------------------------

const HEADER = [
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
  for (const row of rows) {
    lines.push(HEADER.map((h) => quote(row[h] ?? "")).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function utf16le(text: string): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}

const BODY = [
  "{comment:12B🎸}",
  "[Intro🎸:]",
  "{sot}",
  "Intro : [Dm F Am G]",
  "{eot}",
  "",
  "[Verse 1 :]",
  '[Dm]Je marche, la [F]nuit, "seul" à [C]Paris',
  "{comment: Alice}",
  "{soh}x3 (oh){eoh}",
  "",
  "{soc}",
  "[Am]Refrain, [G]refrain",
  "{eoc}",
  "",
  "{soc}",
  "{eoc}",
].join("\r\n");

const SH_TRAILER = [
  "{genre:Rock}",
  "{youtube:https://www.youtube.com/watch?v=abc123}",
  "{other:Lead vocals: Bob}",
  "{notes:🎙️ Alice + 🎹 + Solo🎹 (middle)}",
  "{extra:scale:0,x:0,y:0,newscale:8}",
  "{tempo:120}",
  "{key:RÉm}",
  "{scrollspeed:6}",
  "{transpose:2}",
].join("\r\n");

const LYRICS = `{t:Été indien}\r\n{st:Les Synthétiques}\r\n${BODY}\r\n${SH_TRAILER}\r\n`;

const FULL_ROW: Row = {
  Name: "Été indien",
  GenreName: "Rock",
  ArtistName: "Les Synthétiques",
  Key: "RÉm",
  Notes: "🎙️ Alice + 🎹 + Solo🎹 (middle)",
  Lyrics: LYRICS,
  Tempo: "120",
  SongLength: "3:45",
  Other: "Lead vocals: Bob",
};

// ---------------------------------------------------------------------------
// Full-row mapping
// ---------------------------------------------------------------------------

describe("parseSetlistHelperCsv — full row", () => {
  const { songs, warnings } = parseSetlistHelperCsv(utf16le(buildCsv([FULL_ROW])));
  const [imported] = songs;

  it("produces one song with no warnings", () => {
    expect(songs).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("maps metadata fields", () => {
    expect(imported.song).toMatchObject({
      title: "Été indien",
      artist: "Les Synthétiques",
      key: "Dm",
      bpm: 120,
      duration: 225,
      tags: ["Rock"],
      notes: "🎙️ Alice + 🎹 + Solo🎹 (middle)\nLead vocals: Bob",
      links: { youtube: "https://www.youtube.com/watch?v=abc123" },
      transposition: 2,
    });
  });

  it("stores scrollSpeed on the song and returns fontScale outside the model", () => {
    expect(imported.song.scrollSpeed).toBe(6);
    expect(imported.fontScale).toBe(8);
    expect(imported.song).not.toHaveProperty("fontScale");
  });

  it("preserves the body verbatim (LF newlines)", () => {
    expect(imported.song.content.endsWith(BODY.replace(/\r\n/g, "\n"))).toBe(true);
  });

  it("strips {t}/{st} and Setlist Helper directives from the body", () => {
    const content = imported.song.content;
    for (const name of [
      "t",
      "st",
      "genre",
      "other",
      "extra",
      "tempo",
      "scrollspeed",
      "transpose",
    ]) {
      expect(content).not.toMatch(new RegExp(`\\{${name}:`));
    }
    expect(content).not.toContain("RÉm");
    expect(content).not.toContain("\r");
  });

  it("writes an app-style metadata header the parser reads back", () => {
    const header = imported.song.content.split("\n\n")[0];
    expect(header).toBe(
      [
        "{title: Été indien}",
        "{artist: Les Synthétiques}",
        "{key: Dm}",
        "{bpm: 120}",
        "{duration: 3:45}",
        "{tags: Rock}",
        "{notes: 🎙️ Alice + 🎹 + Solo🎹 (middle) / Lead vocals: Bob}",
        "{youtube: https://www.youtube.com/watch?v=abc123}",
      ].join("\n"),
    );
    const { metadata } = parse(imported.song.content);
    expect(metadata).toMatchObject({
      title: "Été indien",
      artist: "Les Synthétiques",
      key: "Dm",
      bpm: "120",
      duration: "3:45",
      tags: "Rock",
    });
  });
});

// ---------------------------------------------------------------------------
// Fallbacks & edge cases
// ---------------------------------------------------------------------------

describe("parseSetlistHelperCsv — fallbacks and edge cases", () => {
  it("falls back to directives when columns are empty", () => {
    const { songs } = parseSetlistHelperCsv(buildCsv([{ Lyrics: LYRICS }]));
    expect(songs[0].song).toMatchObject({
      title: "Été indien",
      artist: "Les Synthétiques",
      key: "Dm",
      bpm: 120,
      tags: ["Rock"],
      notes: "🎙️ Alice + 🎹 + Solo🎹 (middle)\nLead vocals: Bob",
    });
    expect(songs[0].song.duration).toBeUndefined();
  });

  it("accepts UTF-8 text input", () => {
    const { songs } = parseSetlistHelperCsv(`﻿${buildCsv([FULL_ROW])}`);
    expect(songs[0].song.title).toBe("Été indien");
  });

  it("imports songs without a chart", () => {
    const { songs, warnings } = parseSetlistHelperCsv(
      buildCsv([{ Name: "Sans paroles", ArtistName: "X", Tempo: "0", SongLength: "0:00" }]),
    );
    expect(warnings).toEqual([]);
    expect(songs[0].song).toMatchObject({ title: "Sans paroles", tags: [] });
    expect(songs[0].song.bpm).toBeUndefined();
    expect(songs[0].song.duration).toBeUndefined();
    expect(songs[0].song.content).toBe("{title: Sans paroles}\n{artist: X}");
  });

  it("warns on unparseable key and keeps the song", () => {
    const { songs, warnings } = parseSetlistHelperCsv(buildCsv([{ Name: "Song", Key: "??" }]));
    expect(songs[0].song.key).toBeUndefined();
    expect(warnings).toEqual([{ row: 1, code: "unparseableKey", title: "Song", value: "??" }]);
  });

  it("warns on invalid tempo and duration", () => {
    const { warnings } = parseSetlistHelperCsv(
      buildCsv([{ Name: "Song", Tempo: "fast", SongLength: "long" }]),
    );
    expect(warnings.map((w) => w.code)).toEqual(["invalidTempo", "invalidDuration"]);
  });

  it("clamps transposition and warns", () => {
    const { songs, warnings } = parseSetlistHelperCsv(
      buildCsv([{ Name: "Song", Lyrics: "[A]la\r\n{transpose:14}" }]),
    );
    expect(songs[0].song.transposition).toBe(11);
    expect(warnings[0].code).toBe("transposeClamped");
  });

  it("skips rows without a title", () => {
    const { songs, warnings } = parseSetlistHelperCsv(buildCsv([{ Lyrics: "[A]la" }]));
    expect(songs).toHaveLength(0);
    expect(warnings).toEqual([{ row: 1, code: "missingTitle" }]);
  });

  it("skips duplicate rows within the file", () => {
    const { songs, warnings } = parseSetlistHelperCsv(
      buildCsv([
        { Name: "Été", ArtistName: "A" },
        { Name: "ete", ArtistName: "a" },
      ]),
    );
    expect(songs).toHaveLength(1);
    expect(warnings).toEqual([{ row: 2, code: "duplicateInFile", title: "ete" }]);
  });

  it("rejects files without the expected header", () => {
    expect(() => parseSetlistHelperCsv("foo,bar\r\n1,2\r\n")).toThrow(SetlistHelperFormatError);
  });

  it("keeps non-metadata directives sharing a line with stripped ones", () => {
    const { songs } = parseSetlistHelperCsv(
      buildCsv([{ Name: "S", Lyrics: "[A]la\r\n{c:Outro}{tempo:90}" }]),
    );
    expect(songs[0].song.content.endsWith("[A]la\n{c:Outro}")).toBe(true);
    expect(songs[0].song.bpm).toBe(90);
  });

  it("decodes HTML entities in text fields", () => {
    const { songs } = parseSetlistHelperCsv(
      utf16le(
        buildCsv([
          {
            Name: "Caf&#233; &amp; Th&#xE9;",
            ArtistName: "Les &quot;Fictifs&quot;",
            GenreName: "Vari&#233;t&#233;",
            Notes: "a &lt;b&gt; &#39;c&#39; &apos;d&apos;",
            Lyrics: "[Am]Cr&#232;me",
          },
        ]),
      ),
    );
    expect(songs[0].song).toMatchObject({
      title: "Café & Thé",
      artist: 'Les "Fictifs"',
      tags: ["Variété"],
      notes: "a <b> 'c' 'd'",
    });
    expect(songs[0].song.content.endsWith("[Am]Crème")).toBe(true);
  });

  it("rejects a setlist export", () => {
    expect(() => parseSetlistHelperCsv(`SequenceNumber,${HEADER.join(",")}\r\n`)).toThrow(
      SetlistHelperFormatError,
    );
  });
});

// ---------------------------------------------------------------------------
// Matching & writes
// ---------------------------------------------------------------------------

function existingSong(overrides: Partial<Song>): Song {
  return {
    id: "existing-1",
    title: "Ete Indien",
    artist: "LES SYNTHETIQUES",
    tags: ["old"],
    techNotes: "Fog machine",
    links: { spotify: "spotify:track:1" },
    content: "{title: Ete Indien}\n\n[Am]Notre version",
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

describe("songMatchKey", () => {
  it("is case-, accent- and punctuation-insensitive", () => {
    expect(songMatchKey("Été indien!", "Les Synthétiques")).toBe(
      songMatchKey("ete  INDIEN", "les synthetiques"),
    );
  });

  it("distinguishes different artists", () => {
    expect(songMatchKey("Song", "A")).not.toBe(songMatchKey("Song", "B"));
  });
});

describe("planImport / buildImportWrites", () => {
  const { songs } = parseSetlistHelperCsv(
    buildCsv([FULL_ROW, { Name: "Nouvelle", ArtistName: "Quelqu'un" }]),
  );
  const existing = [existingSong({}), existingSong({ id: "other", title: "Unrelated" })];
  const plan = planImport(songs, existing);
  let counter = 0;
  const createId = () => `new-${++counter}`;

  it("splits new songs and matches", () => {
    expect(plan.newSongs.map((s: ImportedSong) => s.song.title)).toEqual(["Nouvelle"]);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0].existing.id).toBe("existing-1");
  });

  it("skip strategy only adds new songs", () => {
    const writes = buildImportWrites(plan, "skip", 1000, createId);
    expect(writes.updated).toEqual([]);
    expect(writes.added).toHaveLength(1);
    expect(writes.added[0]).toMatchObject({ title: "Nouvelle", createdAt: 1000, updatedAt: 1000 });
    expect(writes.added[0].id).toMatch(/^new-/);
  });

  it("update strategy overwrites imported fields and keeps the rest", () => {
    const writes = buildImportWrites(plan, "update", 1000, createId);
    expect(writes.updated).toHaveLength(1);
    const updated = writes.updated[0];
    expect(updated).toMatchObject({
      id: "existing-1",
      createdAt: 100,
      updatedAt: 1000,
      title: "Été indien",
      key: "Dm",
      tags: ["Rock"],
      techNotes: "Fog machine",
      links: {
        spotify: "spotify:track:1",
        youtube: "https://www.youtube.com/watch?v=abc123",
      },
    });
    expect(updated.content).toContain("{comment:12B🎸}");
  });
});

describe("planImport — songs without a chart", () => {
  // A setlist import creates songs from row metadata only: no chart yet.
  const stub = existingSong({
    id: "stub-1",
    content: "{title: Ete Indien}\n{artist: Les Synthetiques}\n{key: Dm}",
  });
  const { songs } = parseSetlistHelperCsv(buildCsv([FULL_ROW]));
  const plan = planImport(songs, [stub]);
  const createId = () => "unused";

  it("classifies a chart-less match as a fill, not a match", () => {
    expect(plan.matches).toEqual([]);
    expect(plan.fills).toHaveLength(1);
    expect(plan.fills[0].existing.id).toBe("stub-1");
  });

  it("fills the chart even with the skip strategy", () => {
    const writes = buildImportWrites(plan, "skip", 1000, createId);
    expect(writes.added).toEqual([]);
    expect(writes.updated).toHaveLength(1);
    expect(writes.updated[0]).toMatchObject({ id: "stub-1", createdAt: 100, updatedAt: 1000 });
    expect(writes.updated[0].content).toContain("{comment:12B🎸}");
  });

  it("keeps a match when the imported song has no chart either", () => {
    const { songs: empty } = parseSetlistHelperCsv(buildCsv([{ ...FULL_ROW, Lyrics: "" }]));
    const p = planImport(empty, [stub]);
    expect(p.fills).toEqual([]);
    expect(p.matches).toHaveLength(1);
  });
});
