import { type ChordProSong, parse, type Section, type SongLine } from "./parser";
import {
  DEFAULT_PART_VIEW,
  filterSong,
  isPartViewActive,
  type PartView,
  songParts,
} from "./visibility";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function view(patch: Partial<PartView>): PartView {
  return { ...DEFAULT_PART_VIEW, ...patch };
}

/** Readable form of a line: chords in brackets, comments prefixed with `#`. */
function lineText(line: SongLine): string {
  if (line.kind === "comment") return `# ${line.text}`;
  if (line.kind === "chorus-recall") return "↻";
  return line.segments.map((s) => (s.chord ? `[${s.chord}]${s.text}` : s.text)).join("");
}

function sectionName(section: Section): string {
  return section.label ?? section.type;
}

function names(song: ChordProSong): string[] {
  return song.sections.map(sectionName);
}

function linesOf(song: ChordProSong, name: string): string[] {
  const section = song.sections.find((s) => sectionName(s) === name);
  return section ? section.lines.map(lineText) : [];
}

const SONG = `{title: Night Bus}
{comment: 12B 🎸🎹}
{start_of_verse: Verse 1}
[Am]Waiting at the [F]stop again
{comment: Drums enter}
{comment: Palm mute, for=gtr}
{comment: Pad only, for=piano}
{end_of_verse}

{start_of_chorus}
[F]Ride all [G]night
{end_of_chorus}

{comment: Half-time here}

{start_of_tab: Riff, for=guitar}
e|--5--7--|
{comment: Let ring}
{end_of_tab}

{start_of_note: Arrangement}
Everyone drops except drums.
{end_of_note}

{start_of_tab: Groove}
[Am]x---x---
{end_of_tab}

{start_of_keys: Pad, for=Keys}
Hold the Am chord
{end_of_keys}

{start_of_verse: Lead cue, for=vocals}
Breathe before the chorus
{end_of_verse}`;

const parsed = parse(SONG);

// ---------------------------------------------------------------------------
// Default view
// ---------------------------------------------------------------------------

describe("filterSong: default view", () => {
  it("is not active and returns the song unchanged", () => {
    expect(isPartViewActive(DEFAULT_PART_VIEW)).toBe(false);
    expect(filterSong(parsed, DEFAULT_PART_VIEW)).toBe(parsed);
  });

  it("is active as soon as one option differs", () => {
    expect(isPartViewActive(view({ instrument: "guitar" }))).toBe(true);
    expect(isPartViewActive(view({ showCues: false }))).toBe(true);
    expect(isPartViewActive(view({ showChords: false }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

describe("filterSong: layers", () => {
  it("always keeps the setup banner", () => {
    const out = filterSong(
      parsed,
      view({ instrument: "drums", showCues: false, showChords: false }),
    );
    expect(out.setup).toBe("12B 🎸🎹");
  });

  it("always keeps core sections", () => {
    const out = filterSong(parsed, view({ instrument: "drums", showCues: false }));
    expect(names(out)).toEqual(["Verse 1", "chorus"]);
  });

  it("instrument 'all' shows every part, cues on", () => {
    const out = filterSong(parsed, view({ showChords: false }));
    expect(names(out)).toEqual([
      "Verse 1",
      "chorus",
      "custom",
      "Riff",
      "Arrangement",
      "Groove",
      "Pad",
      "Lead cue",
    ]);
  });

  it("hides band sections and untagged comments when cues are off", () => {
    const out = filterSong(parsed, view({ showCues: false }));
    expect(names(out)).toEqual(["Verse 1", "chorus", "Riff", "Pad", "Lead cue"]);
    expect(linesOf(out, "Verse 1")).toEqual([
      "[Am]Waiting at the [F]stop again",
      "# Palm mute",
      "# Pad only",
    ]);
  });

  it("shows only the matching instrument sections", () => {
    const out = filterSong(parsed, view({ instrument: "guitar" }));
    expect(names(out)).toEqual(["Verse 1", "chorus", "custom", "Riff", "Arrangement", "Groove"]);
  });

  it("keeps an untagged comment inside the player's own section, even with cues off", () => {
    const out = filterSong(parsed, view({ instrument: "guitar", showCues: false }));
    expect(linesOf(out, "Riff")).toEqual(["e|--5--7--|", "# Let ring"]);
  });

  it("matches instruments case-insensitively and through synonyms", () => {
    for (const instrument of ["Keys", "piano", "clavier", "🎹"]) {
      const out = filterSong(parsed, view({ instrument, showCues: false }));
      expect(names(out)).toEqual(["Verse 1", "chorus", "Pad"]);
      expect(linesOf(out, "Verse 1")).toEqual(["[Am]Waiting at the [F]stop again", "# Pad only"]);
    }
  });

  it("filters tagged comments by instrument whatever the cues setting", () => {
    const guitar = filterSong(parsed, view({ instrument: "guitare" }));
    expect(linesOf(guitar, "Verse 1")).toEqual([
      "[Am]Waiting at the [F]stop again",
      "# Drums enter",
      "# Palm mute",
    ]);
  });

  it("vocals see their own cue section", () => {
    const out = filterSong(parsed, view({ instrument: "chant", showCues: false }));
    expect(names(out)).toEqual(["Verse 1", "chorus", "Lead cue"]);
  });

  it("drops an unlabeled section emptied by the filter (lone cue between sections)", () => {
    const out = filterSong(parsed, view({ showCues: false }));
    expect(names(out)).not.toContain("custom");
  });

  it("keeps lines outside any section (core)", () => {
    const out = filterSong(parse("[C]Just a [G]song\n{c: louder}"), view({ showCues: false }));
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].lines.map(lineText)).toEqual(["[C]Just a [G]song"]);
  });

  it("keeps bracket section labels like [Intro] and [Solo] (core)", () => {
    const song = parse("[Intro]\n[Em] [G]\n[Verse 1]\n[Em]Hello\n[Solo]\n[Em] [G] [x4]");
    const out = filterSong(song, view({ instrument: "vocals", showCues: false }));
    expect(names(out)).toEqual(["Intro", "Verse 1", "Solo"]);
  });
});

// ---------------------------------------------------------------------------
// Lyrics only (chords off)
// ---------------------------------------------------------------------------

describe("filterSong: lyrics only", () => {
  const lyricsOnly = view({ showChords: false });

  it("removes chords from lyric lines", () => {
    const out = filterSong(parsed, lyricsOnly);
    expect(linesOf(out, "Verse 1")[0]).toBe("Waiting at the stop again");
    expect(linesOf(out, "chorus")).toEqual(["Ride all night"]);
    const lyric = out.sections[0].lines[0];
    expect(lyric.kind === "lyric" && lyric.segments.some((s) => s.chord)).toBe(false);
  });

  it("drops chord-only lines and the spaces chords leave behind", () => {
    const song = parse(
      "[Verse 1]\n[Am] [F] [x2]\n[A]  Working so hard [D] [A], for what? [E]\n\n\n[G]Last line",
    );
    const out = filterSong(song, lyricsOnly);
    expect(linesOf(out, "Verse 1")).toEqual(["Working so hard , for what?", "", "Last line"]);
  });

  it("keeps the section header when every line held chords only", () => {
    const out = filterSong(parse("[Intro]\n[Em G C B]\n[Verse 1]\nHello"), lyricsOnly);
    expect(names(out)).toEqual(["Intro", "Verse 1"]);
    expect(linesOf(out, "Intro")).toEqual([]);
  });

  it("leaves tab (monospace) sections untouched", () => {
    const out = filterSong(parsed, lyricsOnly);
    expect(linesOf(out, "Groove")).toEqual(["[Am]x---x---"]);
    expect(linesOf(out, "Riff")).toEqual(["e|--5--7--|", "# Let ring"]);
  });

  it("keeps highlighted text highlighted", () => {
    const out = filterSong(parse("{sov}\nSing {soh}[C]oh oh{eoh} [G]now\n{eov}"), lyricsOnly);
    const line = out.sections[0].lines[0];
    expect(line.kind === "lyric" && line.segments).toEqual([
      { text: "Sing " },
      { text: "oh oh", highlight: true },
      { text: " now" },
    ]);
  });

  it("filters the chorus shown by a chorus recall", () => {
    const song = parse(
      "{soc}\n[F]Ride all [G]night\n{c: Clap, for=drums}\n{eoc}\n{sov}\nla\n{eov}\n{chorus}",
    );
    const out = filterSong(song, view({ instrument: "keys", showChords: false }));
    const recall = out.sections[2].lines[0];
    expect(recall.kind).toBe("chorus-recall");
    expect(recall.kind === "chorus-recall" && recall.chorus?.lines.map(lineText)).toEqual([
      "Ride all night",
    ]);
    // The recall points at the same filtered chorus as the one shown above it
    expect(recall.kind === "chorus-recall" && recall.chorus).toBe(out.sections[0]);
  });
});

// ---------------------------------------------------------------------------
// Parts found in a song
// ---------------------------------------------------------------------------

describe("songParts", () => {
  it("collects normalized for= values from sections and comments", () => {
    expect(songParts(parsed).sort()).toEqual(["guitar", "keys", "vocals"]);
  });

  it("is empty for a song without for=", () => {
    expect(songParts(parse("[C]Hello\n{c: louder}"))).toEqual([]);
  });
});
