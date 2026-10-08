import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type Segment, type SongLine } from "./parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand: parse source and return flat list of sections */
function sections(source: string) {
  return parse(source).sections;
}

/** Segments of a lyric line; empty for comment / chorus-recall lines */
function segsOf(line: SongLine | undefined): Segment[] {
  return line?.kind === "lyric" ? line.segments : [];
}

/** Shorthand: parse a single line (no section wrapper) and return its segments */
function segments(line: string) {
  const s = sections(line);
  return segsOf(s[0]?.lines[0]);
}

// ---------------------------------------------------------------------------
// 1. Bracket section labels — [Verse 1 :], [Intro 🎸:], [Solo]
// ---------------------------------------------------------------------------

describe("Heuristic: bracket section labels", () => {
  it("recognizes [Verse 1 :] as a verse section", () => {
    const s = sections("[Verse 1 :]\nsome lyrics");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("verse");
    expect(s[0].label).toBe("Verse 1");
  });

  it("recognizes [Intro 🎸:] as an intro section", () => {
    const s = sections("[Intro 🎸:]");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("intro");
  });

  it("recognizes [Solo] as a solo section", () => {
    const s = sections("[Solo]\nsome tab");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("solo");
    expect(s[0].label).toBe("Solo");
  });

  it("recognizes [Chorus x2] as a chorus section", () => {
    const s = sections("[Chorus x2]");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("chorus");
    expect(s[0].label).toBe("Chorus x2");
  });

  it("does NOT treat a chord bracket as a section label", () => {
    const s = sections("[Am]some text");
    expect(segsOf(s[0].lines[0])[0].chord).toBe("Am");
  });

  it("closes previous section when a bracket section appears", () => {
    const s = sections("{sov}\nline1\n[Chorus :]\nline2");
    expect(s).toHaveLength(2);
    expect(s[0].type).toBe("verse");
    expect(s[1].type).toBe("chorus");
  });
});

// ---------------------------------------------------------------------------
// 2. Section keyword matching — FR and EN variants
// ---------------------------------------------------------------------------

describe("Heuristic: section keyword matching", () => {
  const keywords: [string, string][] = [
    ["Verse", "verse"],
    ["Couplet", "verse"],
    ["Chorus", "chorus"],
    ["Refrain", "chorus"],
    ["Bridge", "bridge"],
    ["Pont", "bridge"],
    ["Intro", "intro"],
    ["Outro", "outro"],
    ["Solo", "solo"],
    ["Pre-chorus", "pre-chorus"],
    ["Interlude", "interlude"],
    ["Instrumental", "instrumental"],
    ["Riff", "riff"],
    ["Breakdown", "breakdown"],
  ];

  it.each(keywords)("[%s] maps to type '%s'", (keyword, expectedType) => {
    const s = sections(`[${keyword}]`);
    expect(s[0].type).toBe(expectedType);
  });

  it("is case-insensitive", () => {
    const s = sections("[VERSE 1]");
    expect(s[0].type).toBe("verse");
  });
});

// ---------------------------------------------------------------------------
// 3. Section type normalization — FR synonyms
// ---------------------------------------------------------------------------

describe("Heuristic: section type normalization", () => {
  it("normalizes Couplet → verse", () => {
    const s = sections("[Couplet 2]");
    expect(s[0].type).toBe("verse");
    expect(s[0].label).toBe("Couplet 2");
  });

  it("normalizes Refrain → chorus", () => {
    const s = sections("[Refrain]");
    expect(s[0].type).toBe("chorus");
  });

  it("normalizes Pont → bridge", () => {
    const s = sections("[Pont]");
    expect(s[0].type).toBe("bridge");
  });
});

// ---------------------------------------------------------------------------
// 4. Custom environments — start_of_X / end_of_X
// ---------------------------------------------------------------------------

describe("Heuristic: custom environments", () => {
  it("parses start_of_highlight / end_of_highlight", () => {
    const s = sections("{start_of_highlight}\ntext\n{end_of_highlight}");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("highlight");
    expect(s[0].lines).toHaveLength(1);
  });

  it("does not conflict with built-in environments", () => {
    const s = sections("{sov}\ntext\n{eov}");
    expect(s[0].type).toBe("verse");
  });

  it("handles custom environments with labels", () => {
    const s = sections("{start_of_solo: Guitar Solo, for=guitar}\nnotes\n{end_of_solo}");
    expect(s[0].type).toBe("solo");
    expect(s[0].label).toBe("Guitar Solo");
    expect(s[0].instrument).toBe("guitar");
  });
});

// ---------------------------------------------------------------------------
// 5. Meta directive aliases — {t:}, {st:}, {tempo:}
// ---------------------------------------------------------------------------

describe("Heuristic: meta directive aliases", () => {
  it("{t: Title} becomes metadata.title", () => {
    const { metadata } = parse("{t: My Song}");
    expect(metadata.title).toBe("My Song");
  });

  it("{st: Subtitle} becomes metadata.subtitle", () => {
    const { metadata } = parse("{st: A Subtitle}");
    expect(metadata.subtitle).toBe("A Subtitle");
  });

  it("{tempo: 120} becomes metadata.bpm", () => {
    const { metadata } = parse("{tempo: 120}");
    expect(metadata.bpm).toBe("120");
  });

  it("{artist:}, {key:}, {bpm:} work directly", () => {
    const { metadata } = parse("{artist: ACDC}\n{key: Am}\n{bpm: 140}");
    expect(metadata.artist).toBe("ACDC");
    expect(metadata.key).toBe("Am");
    expect(metadata.bpm).toBe("140");
  });
});

// ---------------------------------------------------------------------------
// 6. Multi-chord bracket expansion — [Dm F Am G] → [Dm] [F] [Am] [G]
// ---------------------------------------------------------------------------

describe("Heuristic: multi-chord bracket expansion", () => {
  it("expands [Dm F Am G] into four separate chords", () => {
    const segs = segments("[Dm F Am G]");
    const chords = segs.filter((s) => s.chord).map((s) => s.chord);
    expect(chords).toEqual(["Dm", "F", "Am", "G"]);
  });

  it("expands with accidentals: [Bm G C#m7 F#7]", () => {
    const segs = segments("[Bm G C#m7 F#7]text");
    const chords = segs.filter((s) => s.chord).map((s) => s.chord);
    expect(chords).toEqual(["Bm", "G", "C#m7", "F#7"]);
  });

  it("preserves surrounding text", () => {
    const segs = segments("Intro : [Dm F Am G]");
    expect(segs[0].text).toBe("Intro : ");
    expect(segs.filter((s) => s.chord)).toHaveLength(4);
  });

  it("handles inline multi-chord with trailing lyrics", () => {
    const segs = segments("[Bm G C#m7 F#7]I'm beggin'");
    expect(segs.filter((s) => s.chord)).toHaveLength(4);
    // Last chord segment should have the trailing text
    const lastChord = segs.filter((s) => s.chord).at(-1);
    expect(lastChord?.text).toBe("I'm beggin'");
  });

  it("does NOT expand single chords", () => {
    const segs = segments("[Am]text");
    expect(segs).toHaveLength(1);
    expect(segs[0].chord).toBe("Am");
  });

  it("does NOT expand non-chord content like [x4]", () => {
    const segs = segments("[x4]");
    // x4 is not a valid chord, so the bracket stays as-is
    expect(segs[0].chord).toBe("x4");
  });

  it("does NOT expand mixed content like [A maintenu x4]", () => {
    const segs = segments("[A maintenu x4]");
    // "maintenu" is not a chord, so no expansion
    expect(segs[0].chord).toBe("A maintenu x4");
  });

  it("handles extra spaces between chords: [G   A]", () => {
    const segs = segments("[G   A]");
    const chords = segs.filter((s) => s.chord).map((s) => s.chord);
    expect(chords).toEqual(["G", "A"]);
  });

  it("expands slash chords: [C/E Am/G]", () => {
    const segs = segments("[C/E Am/G]");
    const chords = segs.filter((s) => s.chord).map((s) => s.chord);
    expect(chords).toEqual(["C/E", "Am/G"]);
  });
});

// ---------------------------------------------------------------------------
// 7. Implicit section creation — lines before any section directive
// ---------------------------------------------------------------------------

describe("Heuristic: implicit section creation", () => {
  it("wraps orphan lines in a custom section", () => {
    const s = sections("just some text");
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("custom");
    expect(s[0].layer).toBe("band");
    expect(s[0].renderMode).toBe("prose");
  });

  it("orphan lines followed by a directive become separate sections", () => {
    const s = sections("orphan line\n{sov}\nverse line\n{eov}");
    expect(s).toHaveLength(2);
    expect(s[0].type).toBe("custom");
    expect(s[1].type).toBe("verse");
  });
});

// ---------------------------------------------------------------------------
// 8. Section args parsing — labels and for= instrument scoping
// ---------------------------------------------------------------------------

describe("Heuristic: section args parsing", () => {
  it("parses a simple label", () => {
    const s = sections("{sov: Verse 1}\nlyrics\n{eov}");
    expect(s[0].label).toBe("Verse 1");
  });

  it("parses for= instrument scoping", () => {
    const s = sections("{start_of_solo: for=guitar}\nnotes\n{end_of_solo}");
    expect(s[0].instrument).toBe("guitar");
  });

  it("parses label + for= together", () => {
    const s = sections("{start_of_solo: Guitar Solo, for=guitar}\nnotes\n{end_of_solo}");
    expect(s[0].label).toBe("Guitar Solo");
    expect(s[0].instrument).toBe("guitar");
  });

  it("instrument sections get layer='instrument'", () => {
    const s = sections("{start_of_solo: for=guitar}\nnotes\n{end_of_solo}");
    expect(s[0].layer).toBe("instrument");
  });
});

// ---------------------------------------------------------------------------
// Standard ChordPro — core parsing behavior
// ---------------------------------------------------------------------------

describe("Standard ChordPro parsing", () => {
  it("parses inline chords with lyrics", () => {
    const segs = segments("Est-ce que [A]tu vois");
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ text: "Est-ce que " });
    expect(segs[1]).toEqual({ chord: "A", text: "tu vois" });
  });

  it("parses multiple inline chords", () => {
    const segs = segments("[C]la [Am]vie [F]est [G]belle");
    expect(segs.map((s) => s.chord)).toEqual(["C", "Am", "F", "G"]);
    expect(segs.map((s) => s.text)).toEqual(["la ", "vie ", "est ", "belle"]);
  });

  it("parses a plain line with no chords", () => {
    const segs = segments("just lyrics here");
    expect(segs).toEqual([{ text: "just lyrics here" }]);
  });

  it("parses chord-only lines", () => {
    const segs = segments("[A] [D] [E]");
    const chords = segs.filter((s) => s.chord).map((s) => s.chord);
    expect(chords).toEqual(["A", "D", "E"]);
  });

  it("preserves empty lines as empty segments", () => {
    const s = sections("{sov}\nline1\n\nline2\n{eov}");
    expect(s[0].lines).toHaveLength(3);
    expect(s[0].lines[1]).toEqual({ kind: "lyric", segments: [{ text: "" }] });
  });

  it("parses standard section directives", () => {
    const s = sections("{sov}\nverse\n{eov}\n{soc}\nchorus\n{eoc}\n{sob}\nbridge\n{eob}");
    expect(s.map((sec) => sec.type)).toEqual(["verse", "chorus", "bridge"]);
  });

  it("assigns correct render modes", () => {
    const s = sections("{sov}\na\n{eov}\n{soc}\nb\n{eoc}\n{sot}\nc\n{eot}");
    expect(s.map((sec) => sec.renderMode)).toEqual(["lyrics", "lyrics", "monospace"]);
  });

  it("assigns correct layers", () => {
    const s = sections("{sov}\na\n{eov}\n{sot}\nb\n{eot}");
    expect(s[0].layer).toBe("core");
    expect(s[1].layer).toBe("band");
  });

  it("keeps leading whitespace in monospace (tab) sections", () => {
    const s = sections("{sot}\n    e|--3--|\n{eot}\n{sov}\n   indented\n{eov}");
    expect(segsOf(s[0].lines[0])).toEqual([{ text: "    e|--3--|" }]);
    expect(segsOf(s[1].lines[0])).toEqual([{ text: "indented" }]);
  });
});

// ---------------------------------------------------------------------------
// Comment directives
// ---------------------------------------------------------------------------

/** All comment lines of a parsed song, in order */
function comments(source: string) {
  return sections(source)
    .flatMap((s) => s.lines)
    .filter((l) => l.kind === "comment");
}

describe("Comment directives", () => {
  const LYRIC = "[Am]first lyric\n";

  it("parses {comment} and {c} as default comments inside a section", () => {
    const s = sections(`${LYRIC}{sov}\n{c: Verse 1}\nline\n{comment: Only Bob}\n{eov}`);
    expect(s[1].lines[0]).toEqual({ kind: "comment", style: "default", text: "Verse 1" });
    expect(s[1].lines[2]).toEqual({ kind: "comment", style: "default", text: "Only Bob" });
  });

  it("parses italic, box and highlight variants", () => {
    const c = comments(
      `${LYRIC}{ci: Softly}\n{comment_italic: Slow}\n{cb: Key change}\n{comment_box: Stop}\n{highlight: Hook}`,
    );
    expect(c.map((l) => (l.kind === "comment" ? l.style : ""))).toEqual([
      "italic",
      "italic",
      "box",
      "box",
      "highlight",
    ]);
  });

  it("keeps a comment between sections", () => {
    const s = sections(`${LYRIC}{sov}\na\n{eov}\n{c: Interlude}\n{soc}\nb\n{eoc}`);
    const between = s.find((sec) => sec.lines.some((l) => l.kind === "comment"));
    expect(between?.type).toBe("custom");
    expect(between?.lines).toEqual([{ kind: "comment", style: "default", text: "Interlude" }]);
  });

  it("parses for=<instrument> on comments", () => {
    const c = comments(`${LYRIC}{comment: Palm mute the verse, for=guitar}`);
    expect(c[0]).toEqual({
      kind: "comment",
      style: "default",
      text: "Palm mute the verse",
      instrument: "guitar",
    });
  });

  it("extracts a comment trailing a lyric line", () => {
    const s = sections("{sov}\nLai[G]sser tomber {comment:↘}\n{eov}");
    expect(segsOf(s[0].lines[0])).toEqual([{ text: "Lai" }, { chord: "G", text: "sser tomber" }]);
    expect(s[0].lines[1]).toEqual({ kind: "comment", style: "default", text: "↘" });
  });

  it("ignores empty comments", () => {
    expect(comments(`${LYRIC}{c}\n{comment: }`)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Setup line — first comment before any lyric
// ---------------------------------------------------------------------------

describe("Setup line", () => {
  it("extracts the first comment before any lyric as setup", () => {
    const song = parse("{title: X}\n{key: Am}\n{comment:22D   -2}\n\n[Verse 1 :]\n[Am]la");
    expect(song.setup).toBe("22D   -2");
    expect(comments("{comment:22D   -2}\n[Am]la")).toHaveLength(0);
  });

  it("keeps emojis and capo text", () => {
    expect(parse("{c: 31C 🎙️🎹🎸🪵🥁}\nla").setup).toBe("31C 🎙️🎹🎸🪵🥁");
    expect(parse("{c: Capo 3 🎸}\nla").setup).toBe("Capo 3 🎸");
  });

  it("only takes the first comment; later ones stay inline", () => {
    const song = parse("{c: 12B}\n{c: Verse 1}\n[Am]la");
    expect(song.setup).toBe("12B");
    expect(comments("{c: 12B}\n{c: Verse 1}\n[Am]la")).toEqual([
      { kind: "comment", style: "default", text: "Verse 1" },
    ]);
  });

  it("has no setup when the first comment comes after lyrics", () => {
    const song = parse("[Intro]\n[G] [C]\n{comment: calme}\nla");
    expect(song.setup).toBeUndefined();
    expect(comments("[Intro]\n[G] [C]\n{comment: calme}\nla")).toHaveLength(1);
  });

  it("bracket section labels and blank lines are not lyric content", () => {
    expect(parse("[Verse 1 :]\n\n{c: 24B}\nla").setup).toBe("24B");
  });
});

// ---------------------------------------------------------------------------
// Highlight — {soh}…{eoh}
// ---------------------------------------------------------------------------

describe("Highlight {soh}…{eoh}", () => {
  it("highlights text inside a single line", () => {
    const segs = segments("Guitarisé, {soh}(oh){eoh}, AC/DC");
    expect(segs).toEqual([
      { text: "Guitarisé, " },
      { text: "(oh)", highlight: true },
      { text: ", AC/DC" },
    ]);
  });

  it("parses chords inside highlighted text", () => {
    const segs = segments("[C9]Anti {soh}[G]x3 [Am]la{eoh} end");
    expect(segs).toEqual([
      { chord: "C9", text: "Anti " },
      { chord: "G", text: "x3 ", highlight: true },
      { chord: "Am", text: "la", highlight: true },
      { text: " end" },
    ]);
  });

  it("highlights a line made only of highlighted text", () => {
    expect(segments("{soh}x3{eoh}")).toEqual([{ text: "x3", highlight: true }]);
  });

  it("spans multiple lines when opened and closed on separate lines", () => {
    const s = sections("{sov}\nbefore {soh}start\nmiddle [G]line\nend{eoh} after\nplain\n{eov}");
    const lines = s[0].lines.map(segsOf);
    expect(lines[0]).toEqual([{ text: "before " }, { text: "start", highlight: true }]);
    expect(lines[1]).toEqual([
      { text: "middle ", highlight: true },
      { chord: "G", text: "line", highlight: true },
    ]);
    expect(lines[2]).toEqual([{ text: "end", highlight: true }, { text: " after" }]);
    expect(lines[3]).toEqual([{ text: "plain" }]);
  });

  it("supports {soh} and {eoh} on their own lines", () => {
    const s = sections("{sov}\n{soh}\nbacking vocals\n{eoh}\nlead\n{eov}");
    expect(s[0].lines).toHaveLength(2);
    expect(segsOf(s[0].lines[0])).toEqual([{ text: "backing vocals", highlight: true }]);
    expect(segsOf(s[0].lines[1])).toEqual([{ text: "lead" }]);
  });
});

// ---------------------------------------------------------------------------
// Chorus recall — {chorus} and empty {soc}{eoc}
// ---------------------------------------------------------------------------

describe("Chorus recall", () => {
  const CHORUS = "{soc: Refrain}\n[G]Chorus line\n{eoc}\n";

  it("{chorus} recalls the last defined chorus", () => {
    const s = sections(`${CHORUS}{sov}\nverse\n{eov}\n{chorus}`);
    const recall = s[2];
    expect(recall.type).toBe("chorus");
    expect(recall.lines).toHaveLength(1);
    const line = recall.lines[0];
    expect(line.kind).toBe("chorus-recall");
    if (line.kind !== "chorus-recall") return;
    expect(line.label).toBeUndefined();
    expect(line.chorus).toBe(s[0]);
  });

  it("{chorus: label} keeps its label", () => {
    const line = sections(`${CHORUS}{chorus: Last chorus}`)[1].lines[0];
    expect(line).toMatchObject({ kind: "chorus-recall", label: "Last chorus" });
  });

  it("an empty {soc}{eoc} pair recalls the last chorus", () => {
    const s = sections(`${CHORUS}{sov}\nverse\n{eov}\n{soc}\n{eoc}`);
    expect(s[2].lines).toEqual([{ kind: "chorus-recall", label: undefined, chorus: s[0] }]);
  });

  it("an empty long-form pair with only blank lines also recalls", () => {
    const s = sections(`${CHORUS}{start_of_chorus}\n\n{end_of_chorus}`);
    expect(s[1].lines[0]).toMatchObject({ kind: "chorus-recall", chorus: s[0] });
  });

  it("recalls the most recent chorus", () => {
    const s = sections(`${CHORUS}{soc}\nsecond\n{eoc}\n{chorus}`);
    expect(s[2].lines[0]).toMatchObject({ kind: "chorus-recall", chorus: s[1] });
  });

  it("does not treat an empty pair as a chorus definition", () => {
    const s = sections(`${CHORUS}{soc}\n{eoc}\n{chorus}`);
    expect(s[2].lines[0]).toMatchObject({ kind: "chorus-recall", chorus: s[0] });
  });

  it("renders a bare marker when no chorus was defined yet", () => {
    const s = sections("{soc}\n{eoc}\n{chorus}\n{soc}\n[G]la\n{eoc}");
    expect(s[0].lines).toEqual([{ kind: "chorus-recall", label: undefined, chorus: undefined }]);
    expect(s[1].lines).toEqual([{ kind: "chorus-recall", label: undefined, chorus: undefined }]);
    expect(s[2].lines).toHaveLength(1);
  });

  it("{chorus} inside an explicit section is added as a line", () => {
    const s = sections(`${CHORUS}{sov}\nverse\n{chorus}\n{eov}`);
    expect(s[1].type).toBe("verse");
    expect(s[1].lines[1]).toMatchObject({ kind: "chorus-recall", chorus: s[0] });
  });

  it("{chorus} closes an implicit section", () => {
    const s = sections(`${CHORUS}loose line\n{chorus}\nafter`);
    expect(s.map((sec) => sec.type)).toEqual(["chorus", "custom", "chorus", "custom"]);
  });
});

// ---------------------------------------------------------------------------
// Real-world fixtures
// ---------------------------------------------------------------------------

const FIXTURE_DIRS = [
  join(__dirname, "../../../fixtures"),
  join(__dirname, "../../../fixtures/personal"),
];

const COMMENT_RE = /\{(?:comment|c|comment_italic|ci|comment_box|cb|highlight):\s*([^}]*)\}/gi;

describe("Fixtures", () => {
  const files = FIXTURE_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".chopro"))
      .map((f) => join(dir, f)),
  );

  it("finds fixture files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)("parses %s without losing comments", (file) => {
    const source = readFileSync(file, "utf8");
    const song = parse(source);

    const parsedComments = [
      ...(song.setup ? [song.setup] : []),
      ...song.sections.flatMap((s) =>
        s.lines.flatMap((l) => (l.kind === "comment" ? [l.text] : [])),
      ),
    ];
    const expected = [...source.matchAll(COMMENT_RE)]
      .map((m) => m[1].trim())
      .filter((text) => text !== "");
    expect(parsedComments).toEqual(expected);

    // No raw directive syntax leaks into rendered lyric text
    const lyricText = song.sections
      .flatMap((s) => s.lines)
      .flatMap((l) => (l.kind === "lyric" ? l.segments.map((seg) => seg.text) : []))
      .join("\n");
    expect(lyricText).not.toMatch(/\{(?:soh|eoh|c|comment)\b/i);
  });
});
