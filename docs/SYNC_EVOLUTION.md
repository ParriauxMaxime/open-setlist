# Sync Evolution Plan

## Current State

The sync system is **all-or-nothing**: the entire DB (all songs + setlists) is exported as a single snapshot, merged with the remote via last-write-wins on `updatedAt`, and pushed back. There is no review step — pressing "Sync Now" immediately pulls, merges, and pushes everything.

### What exists today
- **Orchestrator** (`domain/sync/orchestrator.ts`): Pull → Merge → Push pipeline
- **Merge** (`domain/sync/merge.ts`): Last-write-wins by `updatedAt` timestamp, tombstone-aware
- **Adapters**: GitHub (API v3, stores snapshot.json in a repo) and File (browser import/export)
- **Tombstones** (`domain/sync/tombstones.ts`): localStorage-based deletion tracking, pruned after 30 days
- **Config** (`domain/sync/config.ts`): Single GitHub config in localStorage
- **UI** (`modules/sync/page.tsx`): "Sync Now" button + file import/export
- **DB**: Single Dexie database `"OpenSetlist"` with `songs` and `setlists` tables
- **DB access**: ~20 files import `db` from `@db` — direct Dexie calls everywhere

### Pain points
1. **Fat-finger push**: No way to review what will change before syncing. One tap sends everything.
2. **No selective sync**: Can't push only some songs or setlists. It's the full DB every time.
3. **Single identity**: No concept of "this setlist belongs to my band" vs "this is personal". Everything lives in one flat namespace.
4. **No change visibility**: User has no idea what changed locally since last sync, or what changed remotely.

---

## Phase 1: Profiles (Hard Separation)

### Goal
Support multiple contexts (personal, Band A, Band B) with complete data isolation. Each profile is its own world — own songs, own setlists, own sync config.

### Why hard separation (separate databases)
- **Clean sync**: each profile's DB maps 1:1 to a remote snapshot. No filtering, no accidental leakage.
- **Simpler mental model**: switching profile = switching to a completely different catalog.
- **Remote storage friendly**: each DB is independently syncable to a different remote. No need to slice a single DB by tag before pushing.
- **No cross-contamination risk**: a bug in profile filtering can't leak band B's songs into band A's sync.
- **Trade-off accepted**: sharing a song across profiles requires an explicit copy. This is fine — bands have different arrangements of the same song anyway.

### Design

#### 1.1 Profile data model

```ts
// domain/profiles.ts
interface Profile {
  id: string;        // uuid
  name: string;      // "Personal", "The Rockers"
  avatar?: string;   // emoji or short text ("🎸", "🎹", "MR"), displayed in profile menu
  createdAt: number;
}
```

Stored in localStorage as `open-setlist-profiles` (JSON array). Lightweight — profiles are metadata, not heavy data.

Active profile ID stored in localStorage as `open-setlist-active-profile`.

#### 1.2 One Dexie database per profile

```ts
// db/index.ts — becomes a factory
function openProfileDb(profileId: string): Dexie {
  const db = new Dexie(`open-setlist-${profileId}`);
  db.version(1).stores({
    songs: "id, title, artist, *tags, updatedAt",
    setlists: "id, name, date, updatedAt",
  });
  return db;
}
```

The current singleton `db` export must become a **reactive reference** that changes when the active profile changes.

#### 1.3 DB access pattern — React context

```ts
// db/provider.tsx
const DbContext = createContext<Dexie>(null!);

function DbProvider({ children }: { children: ReactNode }) {
  const [profileId] = useActiveProfile(); // reads from localStorage
  const db = useMemo(() => openProfileDb(profileId), [profileId]);
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

function useDb() {
  return useContext(DbContext);
}
```

**Migration path for existing code**: Every file that currently does `import { db } from "@db"` switches to `const db = useDb()` (in components/hooks) or receives `db` as a parameter (in domain functions).

This is the biggest refactor — ~20 files import `db` directly. But it's mechanical: find-and-replace the import, add the hook call or parameter.

For non-React code (domain layer, orchestrator), pass `db` as an argument:
```ts
// Before
export async function sync(adapter: RemoteSyncPort) { ... db.songs.toArray() ... }
// After
export async function sync(adapter: RemoteSyncPort, db: Dexie) { ... db.songs.toArray() ... }
```

#### 1.4 Per-profile sync config

Current sync config is a single object in localStorage. Change to a map keyed by profile ID:

```ts
// domain/sync/config.ts
// Before: localStorage["open-setlist-sync-config"] = { adapter: "github", ... }
// After:  localStorage["open-setlist-sync-config-{profileId}"] = { adapter: "github", ... }
```

Each profile independently configures its own GitHub repo (or has no sync at all).

#### 1.5 Per-profile tombstones

Same pattern: `localStorage["open-setlist-tombstones-{profileId}"]`

#### 1.6 Profile menu (switch / create / manage)

The profile menu is the **primary UI** for profile management. It lives in the sidebar header — always visible, always one tap away.

**Trigger**: a button showing the active profile's avatar + name (e.g. `🎸 Personal`). Tapping opens a dropdown/popover menu.

**Menu structure**:
```
┌─────────────────────────────┐
│  🎸 Personal          ✓    │  ← active profile (highlighted)
│  🥁 The Rockers             │  ← tap to switch
│  🎹 Jazz Trio               │  ← tap to switch
│─────────────────────────────│
│  + New Profile              │  ← opens inline create form
│  ⚙ Manage Profiles          │  ← navigates to settings
│─────────────────────────────│
│  (i) Each profile has its   │
│  own songs, setlists & sync │
└─────────────────────────────┘
```

**Switch**: tap a profile row → closes menu, swaps the active Dexie database, UI re-renders with the new profile's data. Instant — no loading screen needed (Dexie opens are synchronous).

**Create**: tap "+ New Profile" → inline form in the menu (name + optional avatar picker). On submit: generates UUID, adds to localStorage, creates empty Dexie database, switches to it.

**Avatar picker**: a row of common emoji (🎸🎹🥁🎤🎵🎶) + a free text input for custom emoji or initials. Optional — defaults to first letter of name if not set.

#### 1.7 Manage Profiles (in Settings)

The "Manage Profiles" link in the menu navigates to a section in the Settings page.

**Per-profile actions**:
- **Edit**: rename, change avatar
- **Delete**: confirmation dialog ("This will permanently delete all songs and setlists in this profile"). Deletes the Dexie database + profile-keyed localStorage entries (sync config, tombstones). Cannot delete the last remaining profile.
- **Sync config**: each profile shows its own GitHub config (or "Not configured"). Tapping opens the existing GitHub config form scoped to that profile.

#### 1.8 Migration for existing users

On first load after the update:
1. Check if old `"OpenSetlist"` database exists
2. If yes: create a default "Personal" profile, rename/copy the DB to `open-setlist-{personalId}`
3. Set the new profile as active
4. Migrate existing sync config and tombstones to the profile-keyed format
5. Delete the old `"OpenSetlist"` database

#### 1.9 Implementation steps

1. **`domain/profiles.ts`** — Profile interface, CRUD (localStorage), `useActiveProfile` hook
2. **`db/index.ts`** — `openProfileDb(profileId)` factory, keep old `db` export temporarily for compat
3. **`db/provider.tsx`** — `DbProvider` context, `useDb()` hook
4. **Refactor all `db` imports** — components use `useDb()`, domain functions take `db` param (~20 files, mechanical)
5. **`domain/sync/config.ts`** — profile-keyed config storage
6. **`domain/sync/tombstones.ts`** — profile-keyed tombstone storage
7. **`domain/sync/orchestrator.ts`** — accept `db` param
8. **`db/snapshot.ts`** — `exportSnapshot(db)` / `importSnapshot(db, snapshot)` take db param
9. **`db/migration.ts`** — one-time migration from old single DB
10. **Profile switcher component** — sidebar dropdown
11. **Settings page** — profile management section
12. **Wire `DbProvider`** into `main.tsx` wrapping the app

---

## Phase 2: Selective Push (Change Review)

### Goal
Before pushing, show the user a diff of what changed locally vs remotely. Let them select which outgoing changes to include. Unpushed changes stay local and are proposed again next sync.

### Design

#### 2.1 Track last-synced state

Store the **last-pushed snapshot** in the profile's Dexie database (new `_syncState` table with a single row). This is the baseline for computing diffs.

```ts
db.version(2).stores({
  songs: "id, title, artist, *tags, updatedAt",
  setlists: "id, name, date, updatedAt",
  _syncState: "key",  // single row: { key: "last", snapshot: {...}, pushedAt: number }
});
```

#### 2.2 Diff computation

```ts
// domain/sync/diff.ts
interface SyncDiff {
  incoming: ChangeItem[];  // remote changes (always applied)
  outgoing: ChangeItem[];  // local changes (user selects)
}

interface ChangeItem {
  type: "song" | "setlist";
  id: string;
  name: string;          // song title or setlist name, for display
  change: "added" | "modified" | "deleted";
}
```

To compute:
- **Outgoing**: diff local DB against last-pushed snapshot
  - In local but not in snapshot → added
  - In both but local `updatedAt` > snapshot's → modified
  - Tombstone for something in snapshot → deleted
- **Incoming**: diff remote snapshot against last-pushed snapshot (same logic, reversed)

#### 2.3 Sync flow (new two-step)

```
User taps "Sync"
  → Pull remote snapshot
  → Compute diff (local vs last-pushed vs remote)
  → If no changes either way → "Up to date" toast
  → If changes exist → Show SyncReviewView

SyncReviewView:
  ┌─────────────────────────────────────┐
  │ Incoming (from remote)              │
  │   ✦ "Hotel California" — modified   │
  │   ✦ "New Song" — added              │
  │                                     │
  │ Outgoing (your changes)             │
  │   ☑ "Stairway" — modified           │
  │   ☑ "Old Song" — deleted            │
  │   ☐ "WIP Draft" — added             │ ← user unchecked this
  │                                     │
  │        [Cancel]  [Sync Selected]    │
  └─────────────────────────────────────┘

User taps "Sync Selected"
  → Apply all incoming changes to local DB
  → Build push snapshot: last-pushed + selected outgoing changes
  → Push to remote
  → Update last-pushed snapshot in _syncState
  → Deselected items remain in local DB, proposed next time
```

#### 2.4 Partial push mechanics

When an outgoing change is deselected:
- **Added song unchecked**: song stays in local DB but is not in the pushed snapshot. Next sync it appears as "added" again.
- **Modified song unchecked**: the old version (from last-pushed snapshot) goes into the push. Local keeps the new version. Next sync shows it as "modified" again.
- **Deleted song unchecked**: the song is re-included in the push (from last-pushed snapshot). The tombstone is retained locally. Next sync shows it as "deleted" again.

Incoming changes are always applied — no selective pull for v1. Refusing a remote change would create permanent divergence.

#### 2.5 Implementation steps

1. **DB schema bump** — add `_syncState` table
2. **`domain/sync/diff.ts`** — `computeDiff(localDb, lastSnapshot, remoteSnapshot, tombstones)`
3. **`modules/sync/components/sync-review.tsx`** — change list UI with checkboxes
4. **`domain/sync/orchestrator.ts`** — split into `pullAndDiff()` and `pushSelected(selectedIds)`
5. **`modules/sync/page.tsx`** — two-step flow: pull → review → push
6. **Update `_syncState`** after each successful push

---

## Implementation Order

### Step 1: Profiles (hard separation)
This is foundational — everything else builds on having isolated per-profile databases.

Estimated scope: ~25 files touched, mostly mechanical `db` → `useDb()` refactor.

### Step 2: Selective push
Builds on profiles being stable. Adds the review layer on top of the existing sync orchestrator.

Estimated scope: ~5 new/modified files, contained to the sync domain + sync page.

### Step 3: Future (not planned here)
- Invite links (encode remote storage info + profile name in a URL)
- Remote storage adapter (remoteStorage.io)
- LAN sync (WebRTC)
- Auto-sync on app open
