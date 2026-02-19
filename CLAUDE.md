# Open Setlist

Open-source setlist manager PWA for musicians.

## Stack

React 19, TypeScript, Dexie (IndexedDB), Chicane router, TanStack Table, Tailwind CSS v4, Rspack, Biome.

## Project Structure

- `src/modules/<module>/page.tsx` — page component for each route module (catalog, editor, setlist, performance)
- `src/modules/<module>/components/` — module-specific components colocated with their page
- `src/modules/<module>/hooks/` — module-specific hooks colocated with their page
- `src/modules/design-system/` — reusable UI components (data-table)
- `src/modules/shared/` — cross-module components (admin-layout, nav-link)
- `src/domain/` — domain logic and constants (chordpro parser, music theory)
- `src/db/` — Dexie database setup + data interfaces (Song, Setlist, SetlistSet)

## Conventions

- Domain constants and enums go in `src/domain/` — not inline in components. Use TypeScript-safe enum pattern: `as const` object + derived type + values list. Example: `src/domain/music.ts` for musical keys.
- No `src/routes/` folder — each module owns its `page.tsx`
- List/table views use the shared `DataTable` component (`src/modules/design-system/components/data-table.tsx`) built on TanStack Table. Define columns with `createColumnHelper<T>()`, pass data + columns to `<DataTable>`. Supports sorting and row links via `getRowHref`.
- Use Chicane `<Link to={...}>` for all internal navigation — never raw `<a href={...}>` (causes full page reloads)
- Biome handles formatting and linting; run `yarn lint` to check

## Plan Validation

Before considering any plan complete, run these checks and ensure they pass:

1. `yarn format` — auto-fix formatting issues
2. `yarn lint` — must pass with no errors
3. `yarn typecheck` — must pass with no errors

## CORS Proxy Worker (`worker/`)

The app runs entirely in the browser — no backend. Most external APIs we call (like MusicBrainz) ship CORS headers and work fine from `fetch()`. Ultimate Guitar does not. Browsers block those responses, so we need a thin proxy that forwards the request and adds `Access-Control-Allow-Origin: *`.

That's all the worker does. It accepts `?url=<encoded>`, checks the hostname against an allowlist (`www.ultimate-guitar.com`, `tabs.ultimate-guitar.com`), fetches upstream, and returns the response with CORS headers. No parsing, no transformation — the browser handles everything else.

It runs on Cloudflare Workers (free tier: 100K requests/day, no credit card required).

### Setup

1. **Create a Cloudflare account** at https://dash.cloudflare.com/sign-up if you don't have one.

2. **Install the Wrangler CLI** (Cloudflare's deploy tool):
   ```bash
   npm install -g wrangler
   ```

3. **Authenticate** — opens a browser window to log in:
   ```bash
   wrangler login
   ```

4. **Deploy**:
   ```bash
   cd open-setlist/worker/
   wrangler deploy
   ```
   This prints a URL like `https://open-setlist-proxy.<your-account>.workers.dev`.

5. **Paste the URL** into `src/domain/lookup/config.ts` as the `PROXY_URL` constant. The app uses this at runtime when fetching UG tabs.

### How it's used

The song lookup flow (`src/domain/lookup/`) searches MusicBrainz directly (CORS-enabled) for metadata, then optionally fetches chord content from Ultimate Guitar through the proxy. The proxy is only contacted when a user clicks "Import" on a search result. If the proxy is down or the fetch times out (5s), the form still populates with metadata — chords are just left empty.
