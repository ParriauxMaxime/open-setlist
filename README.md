# Open Setlist

A setlist manager for musicians. Manage your songs, build setlists, and perform on stage — all from your browser.

Your data stays on your device. No account, no cloud, no subscription.

## Why

Every setlist app is closed-source, locked to a platform, or paywalled. Musicians deserve a tool they actually own — one that runs anywhere, stores data locally, and doesn't vanish when a company pivots.

Open Setlist is that tool.

- **You own your data.** Everything lives in your browser's IndexedDB. Nothing is sent anywhere. Export whenever you want.
- **Free and open-source.** No premium tier, no ads, no tracking.
- **Works offline.** Install it once as a PWA and it works without internet. Built for the stage, where wifi is never a given.
- **Minimal by design.** Dark, high-contrast interface readable at arm's length on a music stand.

## Features

- **Song catalog** — title, artist, key, BPM, duration, tags, notes, and full ChordPro content
- **ChordPro editor** — write chord charts in the standard format
- **Song lookup** — search by title, pull metadata from MusicBrainz, import chords from Ultimate Guitar
- **Setlist builder** — organize songs into sets, reorder, plan your show
- **Performance mode** — clean, distraction-free view for playing live
- **Chord reference** — built-in chord diagrams
- **Sync** — export/import as files, or sync across devices via remote storage

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
  domain/           Business logic — music theory, ChordPro parser, validation schemas, song lookup
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
5. Paste the printed URL into `src/domain/lookup/config.ts`

Free tier covers 100K requests/day. The proxy is only hit when importing chords — metadata comes directly from MusicBrainz, which supports CORS natively.

### Conventions

See [`CLAUDE.md`](CLAUDE.md) for coding conventions, file organization rules, and architectural decisions.

## License

MIT
