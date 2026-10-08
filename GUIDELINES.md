# Guidelines

Conventions and decisions for contributing to Open Setlist.

## File Naming

- **All filenames are kebab-case** — `catalog-page.tsx`, `chord-pro.ts`, `song.ts`
- React component files use the kebab-cased version of the exported component name
  - `CatalogPage` → `catalog-page.tsx`
  - `EditSongPage` → `edit-song-page.tsx`
  - `SongCard` → `song-card.tsx`
- Non-component files follow the same rule: `use-auto-scroll.ts`, `parse-chord-pro.ts`

## Project Structure

```
src/
├── app.tsx               # Root component (router switch)
├── main.tsx              # Entry point + SW registration
├── sw.ts                 # Service worker (built in production only)
├── router.ts             # Route definitions (chicane)
├── db/                   # Dexie setup + data interfaces (song.ts, setlist.ts, snapshot.ts)
├── domain/               # Business logic, pure functions, enums, zod schemas
│   ├── chordpro/         # Parser + directives
│   ├── chords/           # Theory, transpose, diagrams data
│   ├── import/           # Setlist Helper importers
│   ├── sync/             # Orchestrator, merge, diff, adapters
│   └── schemas/          # Zod schemas
├── modules/<module>/     # One folder per feature: page.tsx, components/, hooks/
│   ├── design-system/    # Reusable UI (data table, form fields)
│   └── shared/           # Layout, navigation
├── i18n/                 # i18next setup + en/fr locales
└── styles/
    └── global.css        # Tailwind import + @theme design tokens
```

## Models

- Data interfaces live in `src/db/` (one per file), zod schemas in `src/domain/schemas/`
- Named after the domain concept: `song.ts`, `setlist.ts`
- Keep models flat — avoid deeply nested types unless the domain demands it
- Adding a field: update the interface, the zod schema (sync strips unknown keys) and the editor form defaults (the editor saves the whole form)

## Routing

- **Router:** `@swan-io/chicane` — type-safe routes with typed path and search params
- All routes defined in `src/router.ts`
- Route params flow into page components as typed props — no `useParams()` with ambiguous types

## Styling

- **Tailwind CSS v4** with `@theme` design tokens in `src/styles/global.css`
- Use Tailwind utility classes in components
- Design tokens define the color palette, typography, spacing — components consume them
- Keep a coherent design system: use semantic color names (`bg-surface`, `text-muted`, `chord`) not raw hex values

### Theme Ownership

The theme belongs to the end user, not the app. Design with this in mind:

- Theme tokens are defined as CSS custom properties in `@theme`
- Eventually, users will be able to override the theme via a JSON config stored locally
- Theme config is **excluded from band sync** — it's personal to each device
- A user can export their theme as a JSON file and share it with a friend
- The friend imports it on their device — no sync, no conflict, just copy

This means: never hardcode colors in components. Always reference design tokens.

## Formatting & Linting

- **Biome** handles both formatting and linting
- `yarn format` — auto-fix formatting and lint issues
- `yarn lint` — check without fixing (CI-friendly)
- Config in `biome.json`
- Double quotes, semicolons, trailing commas, 2-space indent, 100-char line width

## Code Conventions

- TypeScript strict mode
- Prefix intentionally unused params with `_` (e.g., `_search`)
- No non-null assertions (`!`) — use explicit checks or nullish coalescing
- Imports are auto-sorted by biome

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 |
| Bundler | rspack |
| Router | @swan-io/chicane |
| Local DB | Dexie.js (IndexedDB) |
| Styling | Tailwind CSS v4 |
| Linting | Biome |
| PWA | Custom service worker |
| Language | TypeScript (strict) |
