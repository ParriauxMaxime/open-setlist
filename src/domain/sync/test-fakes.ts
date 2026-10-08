// In-memory fakes for sync tests (Jest, node environment). Not used by the app.
import type { AppDatabase, Setlist, Song } from "@db";
import { SNAPSHOT_VERSION, type Snapshot } from "@db/snapshot";
import type { SyncStateRow } from "@db/sync-state";
import {
  ConflictError,
  type RemotePullResult,
  type RemoteSyncPort,
} from "./ports/remote-sync.port";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

class MemoryTable<T extends { id: string }> {
  rows = new Map<string, T>();
  async toArray(): Promise<T[]> {
    return clone(Array.from(this.rows.values()));
  }
  async clear(): Promise<void> {
    this.rows.clear();
  }
  async bulkAdd(items: T[]): Promise<void> {
    for (const item of items) {
      if (this.rows.has(item.id)) throw new Error(`Duplicate key ${item.id}`);
      this.rows.set(item.id, clone(item));
    }
  }
  async count(): Promise<number> {
    return this.rows.size;
  }
}

export function createMemoryDb(): AppDatabase {
  const songs = new MemoryTable<Song>();
  const setlists = new MemoryTable<Setlist>();
  const syncState = new Map<string, SyncStateRow>();
  const db = {
    songs,
    setlists,
    _syncState: {
      get: async (key: string) => (syncState.has(key) ? clone(syncState.get(key)) : undefined),
      put: async (row: SyncStateRow) => {
        syncState.set(row.key, clone(row));
      },
    },
    transaction: async (_mode: string, ...args: unknown[]) => {
      const fn = args[args.length - 1] as () => Promise<void>;
      return fn();
    },
  };
  return db as unknown as AppDatabase;
}

/** Remote with GitHub-like semantics: every write gets a new version token, stale tokens conflict. */
export class FakeRemote implements RemoteSyncPort {
  readonly name = "Fake";
  snapshot: Snapshot | null = null;
  version = 0;
  pushCount = 0;
  pullCount = 0;
  /** Called once right before the next push is evaluated (simulates a concurrent writer). */
  beforeNextPush: (() => void) | null = null;

  isConfigured(): boolean {
    return true;
  }

  async testConnection(): Promise<string> {
    return "fake";
  }

  get token(): string {
    return `v${this.version}`;
  }

  async pull(): Promise<RemotePullResult | null> {
    this.pullCount++;
    if (!this.snapshot) return null;
    return { snapshot: clone(this.snapshot), versionToken: this.token };
  }

  async push(snapshot: Snapshot, versionToken: string | null): Promise<string> {
    const hook = this.beforeNextPush;
    this.beforeNextPush = null;
    hook?.();
    const expected = this.snapshot ? this.token : null;
    if (versionToken !== expected) throw new ConflictError();
    this.pushCount++;
    this.write(snapshot);
    return this.token;
  }

  /** Another band member writes directly. */
  write(snapshot: Snapshot): void {
    this.snapshot = clone(snapshot);
    this.version++;
  }
}

export function makeSong(id: string, updatedAt: number, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: `Song ${id}`,
    tags: [],
    content: `[C]Line one of ${id}\n[G]Line two`,
    createdAt: 1,
    updatedAt,
    ...overrides,
  };
}

export function makeSnapshot(songs: Song[], extra: Partial<Snapshot> = {}): Snapshot {
  return { version: SNAPSHOT_VERSION, exportedAt: 0, songs, setlists: [], ...extra };
}

/** Put local DB, remote and baseline in the state they'd be in right after a successful sync. */
export async function seedSynced(db: AppDatabase, remote: FakeRemote, songs: Song[]) {
  await db.songs.bulkAdd(songs);
  const snapshot = makeSnapshot(songs);
  remote.write(snapshot);
  await db._syncState.put({ key: "last", snapshot: clone(snapshot), pushedAt: 0 });
}

export function putLocalSong(db: AppDatabase, song: Song): void {
  (db.songs as unknown as MemoryTable<Song>).rows.set(song.id, clone(song));
}

export function removeLocalSong(db: AppDatabase, id: string): void {
  (db.songs as unknown as MemoryTable<Song>).rows.delete(id);
}
