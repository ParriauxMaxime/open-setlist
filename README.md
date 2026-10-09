# Open Setlist

The setlist manager for small bands and orchestras. Song charts, setlists and stage mode — in the browser, offline, shared with your band.

**Try it:** https://parriauxmaxime.github.io/open-setlist/ (a demo profile with songs and setlists is preloaded)

Your data stays on your devices. No account, no subscription, no lock-in.

## Why

Every setlist app is closed-source, locked to a platform, or paywalled — and the "one click sync" of the popular ones sometimes deletes the band's source of truth. Musicians deserve a tool they actually own.

- **You own your data.** Everything lives in your browser's IndexedDB. Export whenever you want, in plain ChordPro and JSON.
- **Free and open-source.** No premium tier, no ads, no tracking.
- **Works offline.** Install it once as a PWA; it opens cold at a venue with no network.
- **Granular, not bloated.** Per-musician views, readiness, private notes — without turning into band-management software.

## Features

**Charts**
- **ChordPro editor** with live metadata sync (title, artist, key, BPM, duration, tags, notes)
- **Band conventions rendered faithfully** — setup line banner (patch codes, instruments, capo), inline cues `{comment}`, highlighted backing vocals `{soh}…{eoh}`, chorus recall (`{chorus}` or an empty chorus), tab blocks
- **Per-instrument parts** — `for=guitar`, `for=keys`… each musician picks "My part"; lyrics-only mode for singers
- **Notation** — English (C D E), solfège (Do Ré Mi) or German (H); key-aware transposition, capo display
- **Song lookup** — search by title, metadata from iTunes, chords from Ultimate Guitar

**Setlists**
- **Setlist builder** — multiple sets, drag and drop, durations vs expected show length
- **Readiness** — mark songs to learn / rehearsing / ready / retired; setlists warn about unready songs
- **Print / PDF** — big-font stage sheet for the floor, chart booklet as a paper backup

**On stage**
- **Performance mode** — swipe or pedal between songs, per-song zoom, chord diagrams on tap
- **Hands-free** — Bluetooth pedals (Page Up/Down, arrows, space), per-song auto-scroll, screen stays awake, fullscreen
- **Tempo** — BPM pulse, click and count-in; next song's key, tempo and setup shown in the footer

**Band**
- **Sync** through a GitHub repo or Google Drive — review incoming/outgoing changes, per-song conflict resolution, deletions that never silently win
- **Safe invites** — passphrase-encrypted invite links, or links without any token
- **Coming from Setlist Helper?** Import your catalog CSV and your setlist CSVs (Sync page). Keys in solfège (`RÉm`) are converted, your comments and highlights are kept.

## Install

Open Setlist is a web app. Open the URL in any modern browser and you're done.

To install it for offline use:

- **iOS** — open in Safari, tap Share, then "Add to Home Screen"
- **Android** — open in Chrome, tap the menu, then "Install app"
- **Desktop** — click the install icon in the address bar (Chrome / Edge)

It now lives on your home screen, launches like a native app, and works without internet.

## Contributing

### Prerequisites

- Node.js 18+
- Yarn

### Run locally

```bash
git clone <repo-url>
cd open-setlist
yarn install
yarn dev
```

Opens at `http://localhost:3000`.

### Commands

| Command | What it does |
|---|---|
| `yarn dev` | Dev server on :3000 with hot reload |
| `yarn build` | Production build to `dist/` |
| `yarn lint` | Biome lint + format check |
| `yarn format` | Auto-fix lint and formatting |

### Project structure

```
src/
  domain/           Business logic — music theory, ChordPro parser, validation schemas, sync, importers
  db/               Dexie (IndexedDB) schema and data interfaces
  modules/          Feature modules, each owns its page and components
    catalog/          Song listing and search
    editor/           Song creation and editing
    setlist/          Setlist management
    performance/      Stage performance view
    chords/           Chord reference
    settings/         User preferences
    sync/             Data export/import
    design-system/    Shared form components, data table
    shared/           Layout, navigation
  router.ts         Route definitions (Chicane)
  app.tsx           Root component
worker/             Cloudflare Worker CORS proxy for song lookup
```

### Stack

| What | Choice |
|---|---|
| UI | React 19, TypeScript |
| Styling | Tailwind CSS v4, hand-rolled components |
| Forms | React Hook Form + Zod |
| Local DB | Dexie (IndexedDB) |
| Router | Chicane |
| Tables | TanStack Table |
| Bundler | Rspack |
| Linter | Biome |

No component library. No backend. Everything runs in the browser.

### CORS proxy for song lookup

The song lookup feature fetches chord charts from Ultimate Guitar, which doesn't serve CORS headers. A tiny Cloudflare Worker (`worker/`) proxies those requests and adds `Access-Control-Allow-Origin: *`. That's all it does — no parsing, no storage, no transformation.

To deploy your own:

1. Create a free account at [Cloudflare](https://dash.cloudflare.com/sign-up) (no credit card)
2. Install the CLI: `npm install -g wrangler`
3. Authenticate: `wrangler login`
4. Deploy:
   ```bash
   cd worker
   wrangler deploy
   ```
5. Paste the printed URL into `src/modules/lookup/adapters/proxy.ts`

Free tier covers 100K requests/day. The proxy is only hit when importing chords — metadata comes directly from the iTunes Search API, which supports CORS natively.

### Conventions

See [`CLAUDE.md`](CLAUDE.md) for coding conventions, file organization rules, and architectural decisions.

## License

MIT
