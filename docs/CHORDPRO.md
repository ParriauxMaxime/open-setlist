# ChordPro in Open Setlist

What we support from the [ChordPro standard](https://www.chordpro.org/), what we extend, and what we deliberately skip.

---

## 1. File Basics

| Aspect | Spec | Open Setlist |
|--------|------|--------------|
| Extensions | `.cho`, `.crd`, `.chopro`, `.chordpro`, `.chord`, `.pro` | Accept all on import. Internal storage is IndexedDB (raw text in `content` field). |
| Encoding | UTF-8 | UTF-8 only. |
| Line types | Song lines, directives `{}`, comments `#` | All three supported. |
| Line continuation | `\` at end of line | **Not supported.** Each line stands alone. Rare in practice, adds parser complexity for no user value. |

---

## 2. Chord Notation — `[chord]lyric`

Chords are inline in square brackets, attached to the syllable that follows.

```
[Am]Down the empty [F]road again
[C]Headlights cutting [G]through the rain
```

### What we parse

| Feature | Supported | Notes |
|---------|-----------|-------|
| Basic chords | Yes | `A`–`G`, sharps `#`, flats `b` |
| Slash chords | Yes | `[C/B]`, `[Am/G]` |
| Extensions | Yes | `7`, `m`, `maj7`, `sus4`, `dim`, `aug`, `add9`, etc. |
| Annotations | Yes | `[*N.C.]`, `[*Coda]`, `[*Rit.]` — asterisk prefix, not transposed |
| Nashville numbers | No | `[1]`, `[4]` — niche, can revisit |
| Roman numerals | No | `[I]`, `[IV]` — niche, can revisit |
| Note names | No | Lowercase `[f]`, `[g]` for individual notes — niche |

### Chord model

The parser treats chords as **opaque strings** today. For transposition, we'll need structured chord parsing:

```
Root (A-G) + Accidental (# | b)? + Quality (m | maj | dim | aug | sus)? + Extension (7 | 9 | 11 | 13 | add9 | ...)? + Bass (/ + Root + Accidental?)?
```

This structured representation lives in the transpose engine, not the ChordPro parser. The parser just extracts the raw string from `[...]`.

---

## 3. Metadata Directives

### Standard ChordPro metadata we support

| Directive | Short | Type | Notes |
|-----------|-------|------|-------|
| `title` | `t` | string | Required. Song title. |
| `subtitle` | `st` | string | Optional subtitle. |
| `artist` | — | string | Artist or band name. |
| `composer` | — | string | |
| `lyricist` | — | string | |
| `copyright` | — | string | |
| `album` | — | string | |
| `year` | — | string | |
| `key` | — | string | Musical key: `C`, `Am`, `F#m`, etc. |
| `time` | — | string | Time signature: `4/4`, `3/4`, `6/8`. |
| `tempo` | — | number | BPM. Standard ChordPro name. |
| `duration` | — | string | Song length, e.g. `4:32`. |
| `capo` | — | number | Capo fret. Does NOT shift the key — chords stay as played shapes. |
| `tag` | — | string | Single tag per directive. Multiple `{tag}` lines allowed. |
| `meta` | — | any | Generic: `{meta: name value}`. Escape hatch for anything. |

### Standard metadata we skip

| Directive | Why |
|-----------|-----|
| `sorttitle` | We sort by `title`. If needed later, we add it. |
| `sortartist` | Same reasoning. |
| `arranger` | Uncommon. Use `{meta: arranger ...}` if needed. |

### Our extensions

| Directive | Type | Why |
|-----------|------|-----|
| `bpm` | number | Alias for `tempo`. Musicians say "BPM", not "tempo". Parser normalizes `tempo` → `bpm`. |
| `tags` | string | Comma-separated: `{tags: original, high-energy, opener}`. Convenience over multiple `{tag}` lines. |
| `notes` | string | Free-text performance notes: `{notes: Start soft, build into chorus.}` |

**Compatibility note:** Our extensions use the `x_` convention in *exported* files when interop matters. Internally we use the short names. An export function can map `bpm` → `{x_bpm: 120}` + `{tempo: 120}` to stay safe. But for files that stay in Open Setlist, we use the direct names — they're cleaner and our parser handles them.

---

## 4. Visibility Layers

In a band, everyone shares the same chart. But a guitarist needs their tab, a sax player needs their part, and the singer just wants lyrics and chords. Open Setlist handles this with **three visibility layers**:

| Layer | What | Who sees it | Toggle |
|-------|------|-------------|--------|
| **Core** | Song structure — lyrics, chords, section markers | Everyone, always | No (always visible) |
| **Band** | Arrangement notes, cues, dynamics | Everyone by default | Can hide |
| **Instrument** | Guitar tab, sax part, keys voicings, drum patterns | Only the matching player | Opt-in per instrument |

### How it looks in a file

```chordpro
{title: Midnight Drive}
{artist: The Signals}
{key: Am}
{bpm: 120}

{start_of_verse: Verse 1}
[Am]Down the empty [F]road again
[C]Headlights cutting [G]through the rain
{end_of_verse}

{start_of_chorus}
[F]Drive all [G]night
[Am]Chase the [Em]light
{end_of_chorus}

{comment: Drums drop to half-time here}

{start_of_tab: Guitar Solo, for=guitar}
e|--12--10--8--7--|--5--3---------|
B|----------------|--------5--3---|
G|----------------|------------4--|
{end_of_tab}

{start_of_sax: Sax Break, for=sax}
Eb Bb C — hold C for 2 beats, slide up to D
Lay back behind the beat on the Bb
{end_of_sax}

{start_of_note: Arrangement}
Everyone drops out except drums.
Build back in bar by bar: bass, keys, guitar.
{end_of_note}
```

### Layer assignment rules

Sections are assigned to a layer based on two things: their environment type and the `for` attribute.

| Has `for=`? | Environment type | Layer | Example |
|-------------|-----------------|-------|---------|
| No | `verse`, `chorus`, `bridge` | Core | `{start_of_verse: Verse 1}` |
| No | `tab`, `note`, or any custom | Band | `{start_of_note: Arrangement}` |
| Yes | Any | Instrument | `{start_of_tab: Solo, for=guitar}` |

Comment directives (`{comment}`, `{ci}`, `{cb}`) are **band** layer by default. A `for` attribute could scope them to an instrument too: `{comment: Palm mute the verse, for=guitar}`.

### The `for` attribute

Any section directive can carry `for=<instrument>` to scope it to a specific player:

```chordpro
{start_of_tab: Riff, for=guitar}
{start_of_note: Voicings, for=keys}
{start_of_verse: Lead Vocal Cue, for=vocals}
{comment: Use brush sticks, for=drums}
```

Instrument names are **free-form strings** — we don't enforce a fixed list. The band decides their own vocabulary. Common ones: `guitar`, `bass`, `keys`, `drums`, `sax`, `vocals`, `trumpet`, `violin`.

In performance mode, each musician picks their instrument. The display logic:
1. **Always show** core layer (song structure)
2. **Show by default** band layer (can toggle off for a clean lyrics-only view)
3. **Show if matching** instrument layer (guitarist sees `for=guitar` sections)

### `for` syntax

The `for` attribute appears after the label in section directives, comma-separated:

```
{start_of_<env>: <label>, for=<instrument>}
{start_of_<env>: for=<instrument>}          # no label
{start_of_tab: for=guitar}                  # tab for guitar, no label
{start_of_tab: Solo, for=guitar}            # tab for guitar, labeled "Solo"
```

For comment directives:

```
{comment: <text>, for=<instrument>}
{comment: Palm mute the verse, for=guitar}
```

---

## 5. Section / Environment Directives

### Supported environments

| Environment | Start / Short | End / Short | Render mode | Notes |
|-------------|---------------|-------------|-------------|-------|
| Verse | `start_of_verse` / `sov` | `end_of_verse` / `eov` | lyrics | Chords + lyrics layout. Section tint. |
| Chorus | `start_of_chorus` / `soc` | `end_of_chorus` / `eoc` | lyrics | Chords + lyrics. Distinct tint. |
| Bridge | `start_of_bridge` / `sob` | `end_of_bridge` / `eob` | lyrics | Chords + lyrics. Different tint. |
| Tab | `start_of_tab` / `sot` | `end_of_tab` / `eot` | monospace | **Fixed-width font.** ASCII tablature. |
| Note | `start_of_note` | `end_of_note` | prose | Plain readable text. Playing instructions. |
| *(any other)* | `start_of_<name>` | `end_of_<name>` | prose | Custom environments default to prose. |

All accept an optional label and an optional `for` attribute.

### Render modes

| Mode | Font | Chord parsing | Use case |
|------|------|--------------|----------|
| **lyrics** | Proportional | Yes — `[chords]` extracted and rendered above text | Verse, chorus, bridge |
| **monospace** | Fixed-width | No — content rendered as-is, spacing preserved | ASCII tab, drum notation |
| **prose** | Proportional | No — plain text, no chord extraction | Playing notes, arrangement instructions |

The parser assigns render mode by environment name:
- `verse`, `chorus`, `bridge` → `lyrics`
- `tab` → `monospace`
- Everything else (`note`, `sax`, `keys`, `drums`, custom names) → `prose`

### Custom / unknown environments

The spec allows `{start_of_anything}` with arbitrary names. We handle these with the environment name stored as `type`. This means:

- `{start_of_sax}`, `{start_of_keys}`, `{start_of_intro}` all work out of the box
- They render as prose with the label shown
- No parser changes needed per instrument — just name your section
- No data loss on round-trip

### Environments we skip (for now)

| Environment | Why |
|-------------|-----|
| Grid (`sog`/`eog`) | Jazz chord grids are a significant feature. Worth adding post-MVP as a dedicated component. |
| ABC (`start_of_abc`) | Requires external renderer (abc2svg). Out of scope. |
| Lilypond (`start_of_ly`) | Requires external renderer. Out of scope. |
| SVG (`start_of_svg`) | Niche. Could revisit for custom diagrams. |
| Textblock (`start_of_textblock`) | Print-oriented. Not relevant for screen-first PWA. |

### Chorus recall

`{chorus}` directive — repeats the last defined chorus at that location.

**Status:** Not yet implemented. Worth adding — it's common in real charts to write the chorus once and reference it. Implementation: store the last chorus section, insert a reference node in the AST.

---

## 5. Formatting Directives

### Supported

| Directive | Short | What it does |
|-----------|-------|-------------|
| `comment` | `c` | Inline comment/instruction rendered visually (not a `#` comment — this one shows up). Stage directions, cues, etc. |
| `comment_italic` | `ci` | Same, italic style. |
| `comment_box` | `cb` | Same, boxed style. |

These are **stage directions** — "solo here", "drums drop out", "key change". Critical for performance mode.

### Skipped

| Directive | Why |
|-----------|-----|
| `image` | Not needed for MVP. Could add later for chord diagram images. |
| `new_page` / `np` | Print concept. We're screen-first. Performance mode scrolls. |
| `new_physical_page` / `npp` | Print-only. |
| `column_break` / `colb` | Print layout. |
| `columns` / `col` | Print layout. |
| All font/size/color directives | We use our own theming system (CSS custom properties via Tailwind). ChordPro's `{textfont}`, `{chordsize}`, etc. are for print renderers. |
| `diagrams` | We'll have our own chord diagram display logic. |
| `titles` | We control title rendering. |
| `pagetype` | Print-only. |

---

## 6. Chord Definitions

### `{define}` — Define a chord voicing

```
{define: Cmaj7 base-fret 1 frets x 3 2 0 0 0}
{define: Cmaj7 base-fret 1 frets x 3 2 0 0 0 fingers 0 3 2 0 0 0}
```

**Status:** Not yet implemented in the parser.

**Plan:** Parse and store chord definitions. Render as chord diagrams (SVG) in the editor and performance mode. This is a high-value feature — musicians often use non-standard voicings and want to communicate them.

Fields to extract:
- `name` — chord identifier
- `base-fret` — starting fret (default 1)
- `frets` — one value per string: number (fret), `0` (open), `x`/`N`/`-1` (muted)
- `fingers` — optional, one value per string

We skip `keys` (keyboard layout), `copy`/`copyall`, `display`, `format` for now.

### `{chord}` — Inline chord diagram

Same syntax as `define` but only displays at that position, doesn't persist.

**Status:** Skip for MVP. `{define}` covers the core need.

---

## 7. Transposition

### `{transpose}` directive

```
{transpose: 2}    # Transpose up 2 semitones from here
{transpose: -3}   # Down 3 semitones
{transpose}        # Cancel transposition
```

**Status:** Not yet implemented.

**Plan:** This is different from our **live transpose** feature (UI control that shifts all chords). The directive is *authored into the file* — the writer is saying "from this point, shift everything." Live transpose is a *playback-time* operation.

Both need the same chord-parsing engine. Priority is live transpose (UI), then directive support.

### Capo interaction

`{key: C}` + `{capo: 2}` means: player uses C shapes, audience hears D.

We should display:
- "Key: C (capo 2 → sounds D)" in the song header
- Chords as written (what fingers do), with an option to show "concert pitch"

---

## 8. What We Don't Support (and why)

| Feature | Reason |
|---------|--------|
| `{new_song}` / `ns` | We store one song per record. Multi-song files aren't relevant. On import, we could split — but it's an edge case. |
| Pango markup (`<b>`, `<i>`, `<span>`) | We control rendering via our own component tree. Inline HTML-like markup in ChordPro content adds complexity. If needed, we'd use our own annotation system. |
| Conditional directives (`{comment-guitar: ...}`) | ChordPro's selector syntax postfixes the directive name. We use `for=<instrument>` instead — cleaner, works on any section or comment, and doesn't require per-directive parsing. |
| Grid environment | Significant standalone feature. Post-MVP. |
| Delegated environments (ABC, Lilypond, SVG) | Require external renderers. Out of scope. |
| All print/layout directives | Screen-first app. We handle layout ourselves. |
| Font/size/color directives | Our theme system (CSS custom properties) handles this. |
| Line continuation (`\`) | Adds parser complexity for near-zero real-world usage. |

---

## 9. Parser Architecture

### Current: single-pass line parser

```
source string
  → split by \n
  → for each line:
      directive? → metadata or section start/end
      song line? → extract [chords] + text segments
  → ChordProSong { metadata, sections[] }
```

### Target: richer AST

The current flat structure works for display, but we'll need more for:
- Visibility layers (core / band / instrument)
- Render modes (lyrics / monospace / prose)
- Comment directives (rendered inline between song lines)
- Chorus recall (`{chorus}` references)
- Chord definitions (stored per-song)
- Transpose directives (affect subsequent content)

Proposed enriched types:

```typescript
type RenderMode = "lyrics" | "monospace" | "prose";
type Layer = "core" | "band" | "instrument";

interface ChordProSong {
  metadata: Map<string, string[]>;  // Allow multiple values (artist, tag)
  sections: Section[];
  chordDefinitions: ChordDefinition[];
}

interface Section {
  type: string;           // "verse", "chorus", "bridge", "tab", "sax", "note", anything
  label?: string;         // "Verse 1", "Guitar Solo", "Arrangement"
  renderMode: RenderMode; // How to display content
  layer: Layer;           // Visibility layer
  instrument?: string;    // Present when layer === "instrument"
  lines: SongLine[];
}

// A line can be lyrics+chords, a comment directive, or a chorus recall
type SongLine =
  | { kind: "lyric"; segments: Segment[] }
  | { kind: "comment"; style: "default" | "italic" | "box"; text: string; instrument?: string }
  | { kind: "chorus-recall"; label?: string };

interface Segment {
  chord?: string;
  text: string;
}

interface ChordDefinition {
  name: string;
  baseFret: number;
  frets: (number | null)[];  // null = muted
  fingers?: (number | null)[];
}
```

### Render mode assignment

```typescript
function getRenderMode(type: string): RenderMode {
  switch (type) {
    case "verse":
    case "chorus":
    case "bridge":
      return "lyrics";
    case "tab":
      return "monospace";
    default:
      return "prose";
  }
}
```

### Layer assignment

```typescript
const CORE_TYPES = new Set(["verse", "chorus", "bridge"]);

function getLayer(type: string, instrument?: string): Layer {
  if (instrument) return "instrument";
  if (CORE_TYPES.has(type)) return "core";
  return "band";
}
```

This is backward-compatible — the current `Line` type maps to `{ kind: "lyric", segments }`, and all existing sections get `layer: "core"` or `layer: "band"` with no `instrument`.

---

## 10. Round-trip / Serialization

A key principle: **parse → modify → serialize should not lose data.**

This means:
- Unknown directives must be preserved (stored as raw strings, re-emitted on serialize)
- Ordering of metadata and sections must be maintained
- Comments (`#` lines) must be preserved
- Blank lines must be preserved

The current parser discards unknown directives and `#` comments. The serializer doesn't exist yet. When we build it, we'll need a lossless intermediate representation, or keep the raw source alongside the parsed AST and patch it.

**Pragmatic approach:** Store the raw ChordPro `content` as the source of truth (we already do this in the Song model). The parsed AST is a *read view* for rendering. Edits go through the editor which modifies the raw text. We only need a serializer for *programmatic* modifications (transpose, metadata update), and those can do targeted string replacements rather than full re-serialization.

---

## 11. Implementation Priorities

### Phase 1 — Solid foundation (current focus)
- [ ] Visibility layers: `for` attribute parsing on sections and comments
- [ ] Render modes: lyrics / monospace / prose based on environment type
- [ ] Arbitrary custom environments (`{start_of_anything}`)
- [ ] `{start_of_note}` / `{end_of_note}` environment
- [ ] Comment directives (`{comment}`, `{ci}`, `{cb}`) with optional `for`
- [ ] Chorus recall (`{chorus}`)
- [ ] Multiple values for repeatable metadata (`artist`, `tag`)
- [ ] Unknown directive preservation
- [ ] `#` comment preservation

### Phase 2 — Transposition
- [ ] Chord structure parser (root, quality, extension, bass)
- [ ] Live transpose (UI control, runtime only)
- [ ] `{transpose}` directive support
- [ ] Capo-aware key display

### Phase 3 — Chord diagrams
- [ ] `{define}` parsing and storage
- [ ] SVG chord diagram renderer
- [ ] Built-in chord library (common voicings)
- [ ] Inline `{chord}` display

### Phase 4 — Advanced
- [ ] Grid environment (`sog`/`eog`)
- [ ] `{image}` directive (for embedded diagrams or notation snippets)
- [ ] Import/export with `x_` prefix mapping for interop
- [ ] Multi-song file splitting on import (`{new_song}`)
