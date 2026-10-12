import type { GitHubConfig } from "../config";
import { sync } from "../orchestrator";
import { ConflictError } from "../ports/remote-sync.port";
import {
  createMemoryDb,
  installMemoryLocalStorage,
  makeSnapshot,
  makeSong,
  putLocalSong,
} from "../test-fakes";
import { createGitHubAdapter } from "./github";

const CONFIG: GitHubConfig = {
  adapter: "github",
  owner: "band",
  repo: "songs",
  token: "t",
  path: "open-setlist.json",
  lastVersionToken: null,
  lastSyncedAt: null,
};

/** The GitHub endpoints the adapter uses, over an in-memory repository. */
class FakeGitHub {
  files = new Map<string, { base64: string; sha: string }>();
  writes = 0;
  /** Like GitHub: no inline content above 1 MB. */
  inlineLimit = 1024 * 1024;

  install(): void {
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
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
        if (existing && body.sha !== existing.sha) return this.json({ message: "conflict" }, 409);
        const sha = `sha${++this.writes}`;
        this.files.set(path, { base64: body.content, sha });
        return this.json({ content: { sha } });
      }
      if (!existing) return this.json({ message: "Not Found" }, 404);
      const size = Buffer.from(existing.base64, "base64").length;
      const inline = size <= this.inlineLimit;
      return this.json({
        sha: existing.sha,
        size,
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

/** A chart the size of the band's real ones, accents and emoji included. */
function bandSong(index: number) {
  const verse = "[Am]Elle a les yeux revolver, [F]elle a le regard qui tue 🎹\n".repeat(50);
  return makeSong(`song-${index}`, index + 1, {
    title: `Chanson n°${index} — Été`,
    content: `{comment: 17A 🎙️🎹}\n${verse}`,
  });
}

const realFetch = globalThis.fetch;
let github: FakeGitHub;

beforeEach(() => {
  installMemoryLocalStorage();
  github = new FakeGitHub();
  github.install();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("GitHub adapter", () => {
  it("pushes and pulls a whole band catalog", async () => {
    const adapter = createGitHubAdapter(CONFIG);
    const songs = Array.from({ length: 60 }, (_, i) => bandSong(i));
    const snapshot = makeSnapshot(songs);
    expect(JSON.stringify(snapshot).length).toBeGreaterThan(150_000);

    const token = await adapter.push(snapshot, null);
    const pulled = await adapter.pull();
    expect(pulled?.versionToken).toBe(token);
    expect(pulled?.snapshot.songs).toEqual(songs);
    expect(github.text(CONFIG.path)).toContain("Chanson n°59 — Été");
  });

  it("syncs 60 songs from a device to an empty repository and to a second device", async () => {
    const adapter = createGitHubAdapter(CONFIG);
    const alice = createMemoryDb();
    for (let i = 0; i < 60; i++) putLocalSong(alice, bandSong(i));
    expect(await sync(adapter, alice, "alice")).toMatchObject({ status: "created", songCount: 60 });

    const bob = createMemoryDb();
    expect(await sync(adapter, bob, "bob")).toMatchObject({ status: "synced", songCount: 60 });
    expect(await bob.songs.count()).toBe(60);
  });

  it("reads a catalog too large for GitHub to return inline", async () => {
    const adapter = createGitHubAdapter(CONFIG);
    const songs = Array.from({ length: 12 }, (_, i) => bandSong(i));
    await adapter.push(makeSnapshot(songs), null);
    github.inlineLimit = 1000;
    expect((await adapter.pull())?.snapshot.songs).toHaveLength(12);
  });

  it("returns null before the first push and reports a stale push as a conflict", async () => {
    const adapter = createGitHubAdapter(CONFIG);
    expect(await adapter.pull()).toBeNull();
    const first = await adapter.push(makeSnapshot([bandSong(1)]), null);
    await adapter.push(makeSnapshot([bandSong(2)]), first);
    await expect(adapter.push(makeSnapshot([bandSong(3)]), first)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
