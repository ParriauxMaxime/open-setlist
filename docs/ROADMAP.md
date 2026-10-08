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
| Remote sync | Partial | GitHub + Google Drive adapters, pull/diff/review/selective push, per-item conflicts, profiles, invite links (`src/domain/sync/`). Bugs below. LAN sync, per-file git layout, remoteStorage: not built. |
| Offline / PWA | Works | SW built from `src/sw.ts` (prod only). Full build asset list precached at install into a per-build cache (`open-setlist-<hash>`, old ones deleted on activate). Same-origin assets cache-first; navigations network-first with 3s timeout, fallback to cached `index.html`; cross-origin and non-GET untouched. PNG icons (apple-touch 180, 192, 512, maskable 512). iOS may still evict storage after weeks unused. |
| Importers (Setlist Helper, `.cho`/`.chopro`, text, PDF) | Missing | Only JSON snapshot and UG scrape. Seed loader ignores `fixtures/personal/` (non-recursive `require.context` in `src/db/seed.ts:9`). |
| Settings / i18n | Works | EN/FR, themes, profiles. A few hardcoded strings. |

## Known bugs (verified)

1. ~~`public/sw.js:49` serves every non-navigation GET cache-first, cross-origin included. GitHub/Drive pulls can return stale snapshots and stale version tokens.~~ Fixed: the SW only handles same-origin requests under its scope (`src/domain/pwa/precache.ts`).
2. ~~`src/domain/sync/orchestrator.ts` retries a push on `ConflictError` with the same version token, without re-pulling.~~ Fixed: re-pulls and rebuilds the push on the fresh remote (max 2 retries), and asks for a new review if the fresh remote touched an item being pushed.
3. ~~`src/domain/sync/merge.ts` never applies remote deletions.~~ Fixed: remote deletions apply unless the item was also edited locally (shown as a conflict). Tombstones are merged into pushed snapshots and kept through the sync import.
4. `src/modules/performance/components/chordpro-view.tsx:184` reserves chord width for chord-only segments (intended, matches Setlist Helper) but also replaces real short lyric fragments with the invisible spacer. `[Am]I ` renders no "I".
5. `{comment}`/`{c}` and `{soh}…{eoh}` are silently dropped. The band's charts use them for patch codes, section labels, singer cues and backing vocals. Editor help and `docs/CHORDPRO.md` claim support.
6. Invite links embed the GitHub PAT in base64 (`src/domain/invite.ts`). Anyone with the link has repo write access.

## Doc drift

- `CLAUDE.md` and `README.md` point to `src/domain/lookup/config.ts` (empty, unused) for the proxy URL and mention MusicBrainz and a 5s timeout. Actual: `src/modules/lookup/adapters/proxy.ts`, iTunes, 8s.
- `GUIDELINES.md` project structure (`src/models`, `src/core`, `src/components`, `src/routes`) matches nothing in the repo. `CLAUDE.md` is correct.

## Gap vs Setlist Helper

| Need | Setlist Helper | Open Setlist | Blocks switching? |
|---|---|---|---|
| Bring existing songs in | Catalog CSV with raw ChordPro, per-song `.cho` export | No import | **Yes.** |
| Faithful chart rendering | Comments, highlights, chorus markers | Dropped | **Yes.** Patch codes, section labels and singer cues disappear. |
| Share setlists in band | One-click cloud sync | GitHub/Drive sync, per-item conflict review | No. Needs real-band validation. |
| Stage ergonomics | Pedal, auto-scroll, screen stays on | Arrow keys only, screen sleeps | **Yes.** Screen locking mid-song is a gig killer. |
| Offline | Native app | PWA, full precache | No. Opens cold with no network. |
| Transpose | Yes | Yes, per song | No. Key-aware spelling and capo are polish. |
| Metronome / BPM blink, MP3, print | Yes | No | No for first gigs. |

## Roadmap

Smallest steps that unlock real band usage first. Each step is shippable alone.

### P0 — Trust on stage (can play one gig)

1. **Fix lyric hiding** in `chordpro-view.tsx` (bug 4): keep the text, give the segment a min width of the chord.
2. **Render the band's chart conventions**: `{comment}`/`{c}`/`{ci}`/`{cb}` inline, the first comment (patch code + instruments) prominent, `{soh}…{eoh}` highlighted, `{chorus}` and empty `{soc}{eoc}` as chorus recall. Parser + view, tests from `fixtures/personal/`.
3. **Screen Wake Lock** in performance mode, re-acquired on `visibilitychange`.
4. **Pedal keys**: handle PageUp/PageDown/Space/ArrowUp/ArrowDown (most BT pedals send these). Configurable "page turn = scroll vs next song" later.
5. **Offline precache** (done): precache the built asset list on SW install (inject manifest at build), bump cache version per build, exclude cross-origin requests (fixes bug 1). Add PNG icons for iOS.

### P1 — Migrate from Setlist Helper (can drop the old app)

6. **Import the Setlist Helper catalog CSV** (`/SongCatalog/ExportCsv`, UTF-16LE): map `t`/`st`/`genre`/`notes`/`tempo`/`key`/`youtube`/`transpose`/`newscale`, normalize solfège keys (`RÉm` → `Dm`), strip SH-only trailing directives from content. Dedupe by title+artist, show a summary before writing. Then the same for `.cho`/`.chopro` files (mobile export).
7. **Non-destructive JSON import**: merge via `mergeSnapshots` instead of clear+replace.
8. **Plain-text chords-over-lyrics conversion** (shared with the UG converter): turns pasted or imported `.txt` charts into inline ChordPro. Fixes UG single-chord lines too.
9. **Setlist import**: CSV / text list of titles matched against the catalog, so existing setlists move over in one step.
   - Done for Setlist Helper setlist CSVs (`/Setlist/ExportCsv?setListId=N`): Sync page > "Import Setlist Helper setlists", several files at once (`src/domain/import/setlist-helper-setlist.ts`, `src/db/import-setlists.ts`). One new setlist per file with a single "Set 1" in `SequenceNumber` order; songs matched by normalized title+artist (oldest wins on catalog duplicates, with a warning); unmatched rows become metadata-only songs or are skipped. Name, date and venue are entered in the preview (the file has none); a name already in use gets " (2)". HTML entities (`&#233;`) are now decoded in both the catalog and setlist importers.
   - Left: set breaks (SH files have none, split manually in the editor), plain-text title lists.

### P2 — Band sharing that never loses data

10. ~~**Sync correctness**: re-pull on conflict (bug 2), apply remote deletions with tombstones (bug 3), keep tombstones on import.~~ Done, with tests (`src/domain/sync/*.test.ts`).
11. ~~**Per-item conflict surfacing** in the review screen when both sides changed since last sync, instead of silent last-write-wins.~~ Done: "Keep mine" / "Take theirs" per item, sync blocked until all are resolved.
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
