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

/** The GitHub endpoints the adapter uses, over an in-memory repository. `install()` replaces `fetch`. */
export class FakeGitHub {
  files = new Map<string, { base64: string; sha: string }>();
  writes = 0;
  requestCount = 0;
  /** Like GitHub: no inline content above 1 MB. */
  inlineLimit = 1024 * 1024;

  install(): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      this.requestCount++;
      const url = new URL(String(input));
      const blob = /\/git\/blobs\/(.+)$/.exec(url.pathname);
      if (blob) {
        const file = [...this.files.values()].find((f) => f.sha === blob[1]);
        return file ? this.json({ content: file.base64, encoding: "base64" }) : this.json({}, 404);
      }
      const path = /\/contents\/(.+)$/.exec(url.pathname)?.[1];
      if (!path) return this.json({ full_name: "band/songs" });
      const existing = this.files.get(path);

      if (init.method === "PUT") {
        const body = JSON.parse(String(init.body));
        if (existing && !body.sha) return this.json({ message: '"sha" wasn\'t supplied.' }, 422);
        if (existing && body.sha !== existing.sha) return this.json({ message: "conflict" }, 409);
        const sha = `sha${++this.writes}`;
        this.files.set(path, { base64: body.content, sha });
        return this.json({ content: { sha } });
      }

      const children = [...this.files.keys()].filter((key) => key.startsWith(`${path}/`));
      if (children.length > 0) {
        return this.json(children.map((key) => ({ name: key.slice(path.length + 1) })));
      }
      if (!existing) return this.json({ message: "Not Found" }, 404);
      const bytes = Buffer.from(existing.base64, "base64");
      const accept = new Headers(init.headers).get("Accept") ?? "";
      if (accept.includes("raw")) return new Response(bytes);
      const inline = bytes.length <= this.inlineLimit;
      return this.json({
        sha: existing.sha,
        size: bytes.length,
        content: inline ? existing.base64.replace(/(.{60})/g, "$1\n") : "",
        encoding: inline ? "base64" : "none",
      });
    }) as typeof fetch;
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  text(path: string): string {
    return Buffer.from(this.files.get(path)?.base64 ?? "", "base64").toString("utf8");
  }
}
