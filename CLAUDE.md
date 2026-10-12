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

## No backend

The app runs entirely in the browser and the project runs no server. Bands sync through their own GitHub repository or Google Drive (`src/domain/sync/adapters/`). On stage, MIDI goes through a companion program on the band's own computer (`companion/`, see `docs/MIDI.md`).
