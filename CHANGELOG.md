# Changelog

## 2026-10-09 — Band-ready

Everything a small band or orchestra needs to leave Setlist Helper, without turning into band-management software.

### Charts
- Band conventions rendered as written: setup line banner (patch codes, instruments, capo), inline cues, highlighted backing vocals `{soh}…{eoh}`, chorus recall (`{chorus}` or an empty chorus), tab blocks that keep their alignment.
- Short lyrics under a chord are no longer hidden.
- Paste any chart: chords written above lyrics are converted to ChordPro, with title, key and capo detected.
- Import `.cho`, `.chopro`, `.crd`, `.pro`, `.txt` files, several at once.
- Chord notation: English, solfège (Do Ré Mi) or German; transposed chords spelled for the target key; transposed key and capo shown on stage.

### Each musician
- **My part**: pick your instrument and see only your parts (`for=guitar`, `for=keys`…), hide cues, or switch to lyrics only.
- B♭, E♭ and F instruments (trumpet, clarinet, saxes, horn) read chords and keys at their written pitch.
- **My notes**: private per-song reminders on your device, shown on stage, never shared.

### Setlists
- Song readiness: to learn, rehearsing, ready, retired — setlists warn about unready songs.
- Print / PDF: big-font stage sheet for the floor, chart booklet as a paper backup.

### On stage
- Bluetooth pedals (Page Up/Down, arrows, space), per-song auto-scroll, screen stays awake, fullscreen, landscape.
- Tempo: BPM pulse, click and count-in.
- Footer shows the next song's key, tempo and setup line; set breaks announced.
- Phones: tabs scroll sideways, header keeps the title readable.

### Band
- Sync never silently loses data: re-pull on conflicts, remote deletions applied, per-song "keep mine / take theirs".
- Invites are passphrase-encrypted, or carry no token at all.
- Import from Setlist Helper: catalog CSV and setlist CSVs (solfège keys converted, accents decoded, comments kept).

### Under the hood
- Offline first: the whole app is cached on first visit; sync requests are never served from cache.
- Editor Save button no longer stays enabled after saving.
- 1000+ automated tests.
