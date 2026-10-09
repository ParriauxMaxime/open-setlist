# Roadmap

Goal: the setlist app for small bands and orchestras — more granular than Setlist Helper, without becoming band-management software.

Last update: 2026-10-09. Health: `yarn lint`, `typecheck`, `test` (800+ tests), `build` pass; CI deploys `main` to GitHub Pages.

## Status

| Area | Status | Where |
|---|---|---|
| Song catalog | Works — search, filters, readiness status column with quick change | `src/modules/catalog/` |
| ChordPro editor | Works — highlighted editor, metadata ⇄ directives sync | `src/modules/editor/` |
| Chart rendering | Works — setup banner, comments (`c`/`ci`/`cb`/`highlight`), `{soh}…{eoh}`, chorus recall (`{chorus}` and empty chorus), tab indentation, short lyrics under chords | `src/domain/chordpro/parser.ts`, `src/modules/performance/components/chordpro-view.tsx` |
| My part | Works — per-instrument filter (`for=`), cues toggle, lyrics-only, written pitch for B♭/E♭/F instruments, private per-song notes | `src/domain/chordpro/visibility.ts`, `src/domain/parts.ts` |
| Notation & transpose | Works — English / solfège / German display, key-aware spelling, transposed key and capo chips | `src/domain/chords/notation.ts`, `transpose.ts` |
| Setlists | Works — sets, drag and drop, durations, unready-song warnings | `src/modules/setlist/` |
| Performance mode | Works — swipe, pedals, auto-scroll, wake lock, fullscreen, tempo pulse/click/count-in, next-song preview, set breaks | `src/modules/performance/` |
| Print / PDF | Works — stage floor sheet, chart booklet, per part (written pitch for B♭/E♭/F) | `src/modules/print/` |
| Importers | Works — Setlist Helper catalog/setlist CSVs, ChordPro and text files (multi-file, `{new_song}` split, UTF-16), paste a chords-over-lyrics chart in the editor | `src/domain/import/` |
| Sync | Works — GitHub / Drive snapshot, review, per-item conflicts, remote deletions via tombstones | `src/domain/sync/` |
| Invites | Works — passphrase-encrypted or token-less links | `src/domain/invite.ts` |
| Onboarding | Works — one-screen first-run setup (instrument → My part, notation, language), versioned What's new card for returning users, Getting Started tour, perform hints | `src/domain/welcome.ts`, `src/modules/shared/components/` |
| Offline / PWA | Works — full precache per build, cross-origin untouched, PNG icons | `src/sw.ts`, `src/domain/pwa/` |
| Chord reference | Partial — 60 guitar shapes + computed piano; no bass/ukulele, no `{define}` | `src/domain/chords/` |
| Song lookup | Partial — iTunes metadata + UG chords via proxy, new songs only | `src/modules/lookup/` |

## Known limitations

- Sync conflicts are per song/setlist, not per line; older app versions on the same remote still use last-write-wins.
- iOS may evict PWA storage after weeks unused — open the app online before a gig.
- Setlist Helper setlist exports have no set breaks: each imported setlist is one set.
- Notation preference applies on the next page open.
- Single 1 MB JS bundle (fine offline; code splitting would need an SW update prompt).

## Next

1. **Validate with a real band** — import the real catalog, one rehearsal, one gig; collect friction.
2. **`{define}` chord diagrams** and bass/ukulele shapes.
3. **Per-line sync merge** for charts edited by two members at once.
4. **Setlist sharing for non-members** (sound engineer): read-only link or PDF.
