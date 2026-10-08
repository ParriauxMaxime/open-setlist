# Roadmap

Audit date: 2026-10-08 (HEAD `3f90860`). Goal: replace Setlist Helper for a gigging band.

## Health

`yarn install`, `lint`, `typecheck`, `test` (54 parser tests, 1 suite), `build` and `dev` all pass. Build emits a single 950 KiB JS chunk (size warning, no code splitting). Yarn 1 is required (`yarn.lock` v1) but is not pinned via `packageManager`.

## Status

| Feature | Status | Notes |
|---|---|---|
| Song catalog | Works | All fields, search, filters (`src/modules/catalog/page.tsx`, `src/domain/search.ts`). No bulk actions, no duration column. |
| ChordPro editor | Partial | Highlighted textarea + metadata two-way sync (`src/modules/editor/`). Parser drops `{comment}`/`{c}`/`{ci}`, `{chorus}` recall, `{time}`, `{define}`, `{transpose}` (`src/domain/chordpro/parser.ts:289`). Lines are trimmed (`:222`), breaking tab alignment. No live preview. |
| Song lookup | Partial | iTunes metadata (not MusicBrainz) + UG chords via proxy (`src/modules/lookup/`). Proxy URL hardcoded in `src/modules/lookup/adapters/proxy.ts:6`. UG converter turns single-chord lines and unknown sections into `{comment}`, which the parser then drops. New songs only. |
| Setlist builder | Works | Sets, dnd-kit reorder across sets, catalog panel, duration totals (`src/modules/setlist/`). Manual save only. |
| Performance mode | Partial | Swipe, arrow keys, sidebar, per-song font scale, transpose, chord popover (`src/modules/performance/`). Missing: auto-scroll, Wake Lock, fullscreen, PageUp/PageDown/Space for pedals. Short lyric fragments under a chord are hidden (`chordpro-view.tsx:184`). |
| Chord reference | Partial | 60 guitar shapes + computed piano (`src/domain/chords/`). Only maj/m/7/m7/maj7. No bass/ukulele, no `{define}`. |
| Transpose | Partial | Per-song, persisted, synced (`src/domain/chords/transpose.ts`). Fixed sharp/flat spelling, `key` field not transposed, capo parsed but unused. |
| File export/import | Works, destructive | JSON snapshot (`src/db/snapshot.ts`). Import wipes and replaces all songs and setlists. |
| Remote sync | Partial | GitHub + Google Drive adapters, pull/diff/review/selective push, profiles, invite links (`src/domain/sync/`). Bugs below. LAN sync, per-file git layout, remoteStorage: not built. |
| Offline / PWA | Partial | Manifest + custom SW (`public/sw.js`). SVG-only icon (iOS needs PNG). Lazy asset caching, so unvisited assets are not offline. SW caches cross-origin GETs (sync APIs) cache-first. |
| Importers (Setlist Helper, `.cho`/`.chopro`, text, PDF) | Missing | Only JSON snapshot and UG scrape. Seed loader ignores `fixtures/personal/` (non-recursive `require.context` in `src/db/seed.ts:9`). |
| Settings / i18n | Works | EN/FR, themes, profiles. A few hardcoded strings. |

## Known bugs (verified)

1. `public/sw.js:49` serves every non-navigation GET cache-first, cross-origin included. GitHub/Drive pulls can return stale snapshots and stale version tokens.
2. `src/domain/sync/orchestrator.ts:121-124` retries a push on `ConflictError` with the same version token, without re-pulling. The retry conflicts again.
3. `src/domain/sync/merge.ts` never applies remote deletions; the review screen shows them but they don't happen.
4. `src/modules/performance/components/chordpro-view.tsx:184` reserves chord width for chord-only segments (intended, matches Setlist Helper) but also replaces real short lyric fragments with the invisible spacer. `[Am]I ` renders no "I".
5. `{comment}`/`{c}` and `{soh}…{eoh}` are silently dropped. The band's charts use them for patch codes, section labels, singer cues and backing vocals. Editor help and `docs/CHORDPRO.md` claim support.
6. Invite links embed the GitHub PAT in base64 (`src/domain/invite.ts`). Anyone with the link has repo write access.

## Doc drift

- `CLAUDE.md` and `README.md` point to `src/domain/lookup/config.ts` (empty, unused) for the proxy URL and mention MusicBrainz and a 5s timeout. Actual: `src/modules/lookup/adapters/proxy.ts`, iTunes, 8s.
- `GUIDELINES.md` project structure (`src/models`, `src/core`, `src/components`, `src/routes`) matches nothing in the repo. `CLAUDE.md` is correct.
- `docs/SYNC_EVOLUTION.md` "Current State" describes the pre-profiles, GitHub-only system.

## Gap vs Setlist Helper

| Need | Setlist Helper | Open Setlist | Blocks switching? |
|---|---|---|---|
| Bring existing songs in | Catalog CSV with raw ChordPro, per-song `.cho` export | No import | **Yes.** |
| Faithful chart rendering | Comments, highlights, chorus markers | Dropped | **Yes.** Patch codes, section labels and singer cues disappear. |
| Share setlists in band | One-click cloud sync | GitHub/Drive sync, with bugs 1-3 | **Yes**, until sync is trustworthy. Sync loss is the reason to leave Setlist Helper. |
| Stage ergonomics | Pedal, auto-scroll, screen stays on | Arrow keys only, screen sleeps | **Yes.** Screen locking mid-song is a gig killer. |
| Offline | Native app | PWA, partial precache | **Yes** for gigs: must open cold with no network. |
| Transpose | Yes | Yes, per song | No. Key-aware spelling and capo are polish. |
| Metronome / BPM blink, MP3, print | Yes | No | No for first gigs. |

## Roadmap

Smallest steps that unlock real band usage first. Each step is shippable alone.

### P0 — Trust on stage (can play one gig)

1. **Fix lyric hiding** in `chordpro-view.tsx` (bug 4): keep the text, give the segment a min width of the chord.
2. **Render the band's chart conventions**: `{comment}`/`{c}`/`{ci}`/`{cb}` inline, the first comment (patch code + instruments) prominent, `{soh}…{eoh}` highlighted, `{chorus}` and empty `{soc}{eoc}` as chorus recall. Parser + view, tests from `fixtures/personal/`.
3. **Screen Wake Lock** in performance mode, re-acquired on `visibilitychange`.
4. **Pedal keys**: handle PageUp/PageDown/Space/ArrowUp/ArrowDown (most BT pedals send these). Configurable "page turn = scroll vs next song" later.
5. **Offline precache**: precache the built asset list on SW install (inject manifest at build), bump cache version per build, exclude cross-origin requests (fixes bug 1). Add PNG icons for iOS.

### P1 — Migrate from Setlist Helper (can drop the old app)

6. **Import the Setlist Helper catalog CSV** (`/SongCatalog/ExportCsv`, UTF-16LE): map `t`/`st`/`genre`/`notes`/`tempo`/`key`/`youtube`/`transpose`/`newscale`, normalize solfège keys (`RÉm` → `Dm`), strip SH-only trailing directives from content. Dedupe by title+artist, show a summary before writing. Then the same for `.cho`/`.chopro` files (mobile export).
7. **Non-destructive JSON import**: merge via `mergeSnapshots` instead of clear+replace.
8. **Plain-text chords-over-lyrics conversion** (shared with the UG converter): turns pasted or imported `.txt` charts into inline ChordPro. Fixes UG single-chord lines too.
9. **Setlist import**: CSV / text list of titles matched against the catalog, so existing setlists move over in one step.

### P2 — Band sharing that never loses data

10. **Sync correctness**: re-pull on conflict (bug 2), apply remote deletions with tombstones (bug 3), keep tombstones on import. Unit tests for `merge.ts` and `diff.ts` first.
11. **Per-item conflict surfacing** in the review screen when both sides changed since last sync, instead of silent last-write-wins.
12. **Safer invites**: stop embedding the PAT, or warn clearly and recommend a fine-grained, single-repo token.

### P3 — Performance polish

13. Auto-scroll with per-song speed (import Setlist Helper `{scrollspeed}`, fall back to duration).
14. Fullscreen toggle; allow landscape (drop `orientation: portrait`).
15. Key-aware transposed spelling, transposed `key` display, capo display.
16. BPM blink / click.
17. Code-split heavy routes (tuner, chords, sync) to cut the 950 KiB bundle.

### Housekeeping (do alongside)

- Fix doc drift above; delete `src/domain/lookup/config.ts`.
- Pin Yarn 1 via `packageManager`; run CI on pull requests.
- Tests for transpose, UG converter, snapshot import.
