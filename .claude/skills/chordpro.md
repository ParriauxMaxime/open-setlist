# ChordPro Format — Quick Reference

**Trigger:** Use when working with `.chopro` files, the ChordPro parser (`src/domain/chordpro/parser.ts`), the renderer (`src/modules/performance/components/chordpro-view.tsx`), or any format-related task.

**Full spec:** `docs/CHORDPRO.md`

---

## Metadata Directives

| Directive | Alias | Type | Notes |
|-----------|-------|------|-------|
| `title` | `t` | string | Required |
| `subtitle` | `st` | string | |
| `artist` | — | string | |
| `composer` | — | string | |
| `lyricist` | — | string | |
| `copyright` | — | string | |
| `album` | — | string | |
| `year` | — | string | |
| `key` | — | string | `C`, `Am`, `F#m`, etc. |
| `time` | — | string | `4/4`, `3/4`, `6/8` |
| `tempo` | — | number | BPM (standard name) |
| `duration` | — | string | e.g. `4:32` |
| `capo` | — | number | Fret number. Does NOT shift key. |
| `tag` | — | string | Single tag per directive, repeatable |
| `meta` | — | any | `{meta: name value}` |

### Custom extensions

| Directive | Type | Notes |
|-----------|------|-------|
| `bpm` | number | Alias for `tempo`. Parser normalizes `tempo` → `bpm`. |
| `tags` | string | Comma-separated: `{tags: original, high-energy}` |
| `notes` | string | Free-text: `{notes: Start soft, build into chorus.}` |
| `tech_notes` | string | Back-of-house cues: `{tech_notes: Spotlight on guitar for solo. Fog on bridge.}` |

---

## Section Directives

| Environment | Start / Short | End / Short | Render mode | Default layer |
|-------------|---------------|-------------|-------------|---------------|
| Verse | `start_of_verse` / `sov` | `end_of_verse` / `eov` | lyrics | core |
| Chorus | `start_of_chorus` / `soc` | `end_of_chorus` / `eoc` | lyrics | core |
| Bridge | `start_of_bridge` / `sob` | `end_of_bridge` / `eob` | lyrics | core |
| Tab | `start_of_tab` / `sot` | `end_of_tab` / `eot` | monospace | band |
| Note | `start_of_note` | `end_of_note` | prose | band |
| *(custom)* | `start_of_<name>` | `end_of_<name>` | prose | band |

### Render modes

- **lyrics** — Proportional font, `[chords]` extracted above text (verse, chorus, bridge)
- **monospace** — Fixed-width, content as-is (tab)
- **prose** — Proportional, plain text, no chord extraction (note, custom)

### Comment directives

| Directive | Short | Style |
|-----------|-------|-------|
| `comment` | `c` | Default |
| `comment_italic` | `ci` | Italic |
| `comment_box` | `cb` | Boxed |

---

## The `for` Attribute (Visibility Layers)

Any section or comment directive can carry `for=<instrument>` to scope it to a specific player:

```
{start_of_tab: Solo, for=guitar}
{start_of_note: Voicings, for=keys}
{comment: Use brush sticks, for=drums}
```

### Layer assignment

| Has `for=`? | Environment type | Layer |
|-------------|-----------------|-------|
| No | verse, chorus, bridge | **core** (always visible) |
| No | tab, note, custom | **band** (visible by default, can hide) |
| Yes | Any | **instrument** (only matching player) |

Instrument names are free-form strings — the band decides their vocabulary.

---

## Chord Notation

Chords are inline in square brackets: `[Am]Down the empty [F]road`

**Supported:** Basic chords (A–G, #, b), slash chords (`[C/B]`), extensions (`7`, `m`, `maj7`, `sus4`, `dim`, `aug`, `add9`), annotations (`[*N.C.]`, `[*Coda]`).

**Not supported:** Nashville numbers, Roman numerals, lowercase note names.

### Bracket section heuristic

The parser detects lines like `[Verse]`, `[Chorus 2]` that look like section headers (common in non-ChordPro formats) and treats them as section markers rather than chord+lyric lines.

### Multi-chord expansion

Multiple chords on an otherwise empty line are valid: `[Am] [F] [C] [G]`

---

## Key Source Files

- `src/domain/chordpro/parser.ts` — ChordPro parser (line-by-line, produces AST)
- `src/modules/performance/components/chordpro-view.tsx` — ChordPro renderer
- `docs/CHORDPRO.md` — Full specification (485 lines)
