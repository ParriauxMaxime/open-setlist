# Research Notes

What exists, what's missing, what we can learn from.

## Existing Tools

### SetlistHelper
- **URL**: https://www.setlisthelper.com/
- **Platforms**: Android, iOS, Web
- **Model**: Freemium (setlist-only free, lyrics version paid)
- **Key features**: Song catalog, lyrics (ChordPro), drag-and-drop setlists, transpose, metronome, MP3 attachment, auto-scroll, Bluetooth pedal, print, sync
- **Strengths**: Full-featured, been around a while, mobile-native
- **Weaknesses**: Closed source, data locked in their ecosystem, paid tiers

### BandHelper (successor to Set List Maker)
- **URL**: https://www.bandhelper.com/
- **Platforms**: iOS, Android, Web
- **Model**: Subscription ($3-10/mo depending on tier)
- **Key features**: Everything SetlistHelper does + MIDI presets, remote control, auto-scroll, scheduling, contacts, income tracking, checklists, stage plots
- **Strengths**: Most feature-complete tool in the space. Band management beyond setlists.
- **Weaknesses**: Expensive for what it is. Closed source. Overkill for solo musicians. Set List Maker (predecessor) discontinued May 2024.

### SetListGo
- **URL**: https://setlistgo.github.io/
- **Platforms**: Web only
- **Model**: Free (but NOT open source — "All rights reserved")
- **Key features**: Song database, drag-and-drop, vibe/energy categorization, PDF export, sharing via link, mobile responsive
- **Strengths**: Clean UI, no sign-up, free
- **Weaknesses**: Not open source despite feeling like it should be. Limited features. No lyrics, no transpose, no metronome.

### AbleSet
- **URL**: https://ableset.com/
- **Platforms**: Desktop (Ableton Live integration)
- **Model**: Paid
- **Key features**: Ableton Live setlist management, network sync, performance mode
- **Strengths**: Deep DAW integration
- **Weaknesses**: Ableton-only. Useless without a DAW.

### Worship Manager (open source)
- **URL**: https://github.com/ms609/worship
- **Platforms**: Web (Chrome)
- **Model**: Open source
- **Key features**: Lyrics projection, chord transpose, setlist creation/sharing, presentation integration
- **Strengths**: Actually open source. HTML/JS only, runs offline.
- **Weaknesses**: Church/worship-specific. Not designed for general band use.

## The Gap

No general-purpose, open-source setlist manager exists.

Every musician is choosing between:
- Paying monthly for BandHelper
- Using SetlistHelper's limited free tier
- Cobbling together notes apps and PDFs
- Paper setlists (honestly still common)

## Key Insights

1. **ChordPro is the standard** — any lyrics tool needs to support it
2. **Offline is non-negotiable** — venues have terrible internet
3. **Performance mode needs to be rock-solid** — zero bugs, zero distractions on stage
4. **Data portability matters** — musicians switch tools constantly because nothing sticks
5. **Most musicians use phones/tablets on stage** — mobile-first or at least mobile-ready
6. **Bluetooth pedals are a real workflow** — hands-free page turning is huge for gigging musicians
7. **MIDI is a power-user feature** — but the musicians who need it REALLY need it
8. **Energy/mood flow** — SetListGo's vibe tagging is actually a smart idea for building setlists

## Real-World Pain Points (from Maxime, actual SetlistHelper user)

### Sync is the #1 problem
> "Synchronization amongst the band is the real culprit: the one click to sync is sometimes deleting the source of truth."

This is the killer issue. Every sync tool in this space uses some form of last-write-wins or opaque cloud merge. When it goes wrong, data is gone. Musicians don't have time to debug sync conflicts 5 minutes before going on stage.

**Our answer:** Source of truth is plain files on disk. Always there, always readable. Sync is additive and conflict-aware — never silently overwrites.

### Multi-device is a real workflow, not a nice-to-have
- **Computer**: heavy editing — writing charts, arranging, managing the full catalog
- **Tablet**: the stage device — performance mode, plus quick edits right before going live
- **Phone**: rehearsal pocket reference

These aren't three versions of the same app. They're three contexts with different needs from the same data.

### ChordPro is good but incomplete
The format is the right foundation, but it's missing:
- Structured metadata (BPM, duration, energy, tags)
- Section-level navigation (jump to bridge, loop chorus)
- Annotation layers (per-musician notes on shared charts)
- Rich formatting beyond chords-over-lyrics

We extend it, staying backward-compatible with standard ChordPro parsers.

### Last-minute edits are real
"We might need to update a part just before a live, so on the tablet."

Performance mode isn't read-only. It needs a fast path to edit — change a key, update a lyric, add a note — without leaving the stage context. But heavy restructuring stays on the computer.

### The format IS the product
If the files are human-readable and the format is open, the app becomes replaceable. That's the point. The data outlives any tool. A musician should be able to open their song files in a text editor 10 years from now and still read them.
