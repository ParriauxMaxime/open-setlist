import type { Song } from "@db/song";
import { parse } from "../chordpro/parser";
import {
  CHART_FILE_WARNING_CODES,
  isChartFileName,
  parseChartFiles,
  splitChordProSongs,
} from "./chart-files";
import { planImport } from "./setlist-helper";

const text = (...lines: string[]) => lines.join("\n");

const utf8 = (name: string, content: string) => ({
  name,
  bytes: new TextEncoder().encode(content),
});

/** UTF-16LE with BOM, as Setlist Helper exports its CSV. */
function utf16le(name: string, content: string) {
  const bytes = new Uint8Array(2 + content.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }
  return { name, bytes };
}

/** A Setlist Helper mobile `.cho` export (synthetic). */
const SH_CHO = text(
  "{t:Midnight Drive}",
  "{st:The Signals}",
  "{comment: 12B 🎸🎹}",
  "[Verse 1 :]",
  "[Am]Down the empty [F]road again",
  "{soc}",
  "{eoc}",
  "{genre:Rock}",
  "{youtube:https://example.com/watch}",
  "{notes:🎙️ Max}",
  "{extra:scale:0,x:0,y:0,newscale:8}",
  "{tempo:120}",
  "{key:LAm}",
  "{scrollspeed:6}",
  "{transpose:2}",
);

describe("isChartFileName", () => {
  it.each([
    "a.cho",
    "a.CHOPRO",
    "a.chordpro",
    "a.chord",
    "a.crd",
    "a.pro",
    "notes.txt",
  ])("%s is accepted", (name) => expect(isChartFileName(name)).toBe(true));
  it.each(["a.pdf", "a.csv", "cho", "a.cho.bak"])("%s is rejected", (name) =>
    expect(isChartFileName(name)).toBe(false));
});

describe("splitChordProSongs", () => {
  it("splits on {new_song} and {ns}, dropping empty parts", () => {
    expect(
      splitChordProSongs(
        text("{title: A}", "x", "{new_song}", "{title: B}", "  {NS}  ", "", "{ns}"),
      ),
    ).toEqual(["{title: A}\nx", "{title: B}"]);
  });
});

describe("parseChartFiles", () => {
  it("maps a Setlist Helper .cho like the catalog CSV import", () => {
    const { songs, warnings } = parseChartFiles([utf8("midnight.cho", SH_CHO)]);
    expect(warnings).toEqual([]);
    expect(songs).toHaveLength(1);
    const [{ song, file, converted }] = songs;
    expect(file).toBe("midnight.cho");
    expect(converted).toBe(false);
    expect(song).toMatchObject({
      title: "Midnight Drive",
      artist: "The Signals",
      key: "Am",
      bpm: 120,
      tags: ["Rock"],
      notes: "🎙️ Max",
      links: { youtube: "https://example.com/watch" },
      transposition: 2,
      scrollSpeed: 6,
    });
    // Setlist Helper directives are moved to our header; the chart itself is kept
    expect(song.content).toBe(
      text(
        "{title: Midnight Drive}",
        "{artist: The Signals}",
        "{key: Am}",
        "{bpm: 120}",
        "{tags: Rock}",
        "{notes: 🎙️ Max}",
        "{youtube: https://example.com/watch}",
        "",
        "{comment: 12B 🎸🎹}",
        "[Verse 1 :]",
        "[Am]Down the empty [F]road again",
        "{soc}",
        "{eoc}",
      ),
    );
  });

  it("reads standard ChordPro directives without duplicating them", () => {
    const cho = text(
      "{title: Night Train}",
      "{artist: The Signals}",
      "{key: F#m}",
      "{bpm: 96}",
      "{duration: 3:45}",
      "{tags: rock, opener}",
      "{capo: 2}",
      "{tech_notes: Fog on the bridge}",
      "",
      "{start_of_verse}",
      "[F#m]All aboard",
      "{end_of_verse}",
    );
    const [{ song }] = parseChartFiles([utf8("night.chopro", cho)]).songs;
    expect(song).toMatchObject({
      title: "Night Train",
      artist: "The Signals",
      key: "F#m",
      bpm: 96,
      duration: 225,
      tags: ["rock", "opener"],
      techNotes: "Fog on the bridge",
    });
    for (const name of ["title", "artist", "key", "bpm", "duration", "tags"]) {
      expect(song.content.match(new RegExp(`\\{${name}:`, "g"))).toHaveLength(1);
    }
    expect(parse(song.content).metadata.capo).toBe("2");
  });

  it("converts a plain-text chart and takes metadata from its header", () => {
    const txt = text(
      "Riverside - The Signals",
      "Key: G   Capo 2",
      "",
      "Verse 1:",
      "G           C",
      "Down by the riverside",
    );
    const { songs, warnings } = parseChartFiles([utf8("riverside.txt", txt)]);
    expect(warnings).toEqual([]);
    const [{ song, converted }] = songs;
    expect(converted).toBe(true);
    expect(song).toMatchObject({ title: "Riverside", artist: "The Signals", key: "G" });
    expect(song.content).toContain("[Verse 1]\n[G]Down by the [C]riverside");
    expect(parse(song.content).metadata.capo).toBe("2");
  });

  it("uses the file name when there is no title", () => {
    const { songs, warnings } = parseChartFiles([utf8("03_Blue_moon.txt", "Am\nBlue moon")]);
    expect(songs[0].song.title).toBe("03 Blue moon");
    expect(songs[0].song.content).toBe("{title: 03 Blue moon}\n\n[Am]Blue moon");
    expect(warnings).toEqual([
      {
        file: "03_Blue_moon.txt",
        code: CHART_FILE_WARNING_CODES.titleFromFileName,
        title: "03 Blue moon",
      },
    ]);
  });

  it("decodes UTF-16LE with BOM and CRLF line endings", () => {
    const cho = "{t:Été indien}\r\n{st:Les Voisins}\r\n{key:RÉm}\r\n[Dm]Tu sais\r\n";
    const [{ song }] = parseChartFiles([utf16le("ete.cho", cho)]).songs;
    expect(song).toMatchObject({ title: "Été indien", artist: "Les Voisins", key: "Dm" });
    expect(song.content).not.toContain("\r");
    expect(song.content.endsWith("[Dm]Tu sais")).toBe(true);
  });

  it("strips a UTF-8 BOM", () => {
    const [{ song }] = parseChartFiles([utf8("a.cho", "﻿{title: Bom}\n[C]Hi")]).songs;
    expect(song.title).toBe("Bom");
  });

  it("splits multi-song files", () => {
    const cho = text(
      "{title: One}",
      "[C]First",
      "{new_song}",
      "{title: Two}",
      "[G]Second",
      "{ns}",
      "[D]Third",
    );
    const { songs, warnings } = parseChartFiles([utf8("medley.cho", cho)]);
    expect(songs.map((s) => s.song.title)).toEqual(["One", "Two", "medley (3)"]);
    expect(warnings.map((w) => w.code)).toEqual([CHART_FILE_WARNING_CODES.titleFromFileName]);
  });

  it("reports unsupported, empty and duplicate files, and bad values", () => {
    const { songs, warnings } = parseChartFiles([
      utf8("scan.pdf", "%PDF"),
      utf8("empty.cho", " \n\n"),
      utf8("a.cho", "{title: Same}\n{artist: Band}\n{key: H}\n{tempo: fast}\n[C]x"),
      utf8("b.cho", "{title: SAME}\n{artist: band}\n[C]y"),
    ]);
    expect(songs.map((s) => s.file)).toEqual(["a.cho"]);
    expect(songs[0].song.key).toBeUndefined();
    expect(warnings).toEqual([
      { file: "scan.pdf", code: CHART_FILE_WARNING_CODES.unsupportedFile },
      { file: "empty.cho", code: CHART_FILE_WARNING_CODES.emptyFile },
      { file: "a.cho", code: CHART_FILE_WARNING_CODES.unparseableKey, title: "Same", value: "H" },
      { file: "a.cho", code: CHART_FILE_WARNING_CODES.invalidTempo, title: "Same", value: "fast" },
      { file: "b.cho", code: CHART_FILE_WARNING_CODES.duplicateInFile, title: "SAME" },
    ]);
  });

  it("plans against the catalog by title + artist, keeping file info", () => {
    const existing: Song = {
      id: "s1",
      title: "Midnight drive",
      artist: "the signals",
      tags: [],
      content: "",
      createdAt: 1,
      updatedAt: 1,
    };
    const { songs } = parseChartFiles([
      utf8("midnight.cho", SH_CHO),
      utf8("new.cho", "{title: Brand New}\n[C]x"),
    ]);
    const plan = planImport(songs, [existing]);
    expect(plan.matches.map((m) => [m.imported.file, m.existing.id])).toEqual([
      ["midnight.cho", "s1"],
    ]);
    expect(plan.newSongs.map((s) => s.file)).toEqual(["new.cho"]);
  });
});
