import { parse } from "./parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand: parse source and return flat list of sections */
function sections(source: string) {
  return parse(source).sections;
}

/** Shorthand: parse a single line (no section wrapper) and return its segments */
function segments(line: string) {
  const s = sections(line);
  return s[0]?.lines[0]?.segments ?? [];
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
    expect(s[0].lines[0].segments[0].chord).toBe("Am");
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
    expect(s[0].lines[1].segments).toEqual([{ text: "" }]);
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
});
