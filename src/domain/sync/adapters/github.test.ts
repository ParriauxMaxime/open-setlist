import type { GitHubConfig } from "../config";
import { sync } from "../orchestrator";
import { ConflictError } from "../ports/remote-sync.port";
import {
  createMemoryDb,
  FakeGitHub,
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

  it("keeps sheet music files in a folder next to the snapshot", async () => {
    const { files } = createGitHubAdapter({ ...CONFIG, path: "band/open-setlist.json" });
    if (!files) throw new Error("The GitHub adapter syncs files");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(await files.list()).toEqual([]);
    expect(await files.get(id)).toBeNull();

    const bytes = new Uint8Array(300_000).map((_, i) => (i * 31) % 251);
    await files.put(id, new Blob([bytes]));
    expect(await files.list()).toEqual([id]);
    expect([...github.files.keys()]).toEqual([`band/open-setlist-files/${id}`]);
    const back = new Uint8Array((await (await files.get(id))?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(back.length).toBe(bytes.length);
    expect(back.every((b, i) => b === bytes[i])).toBe(true);
  });

  it("never replaces a file already stored under an id", async () => {
    const { files } = createGitHubAdapter(CONFIG);
    if (!files) throw new Error("The GitHub adapter syncs files");
    const id = "22222222-2222-4222-8222-222222222222";
    await files.put(id, new Blob(["first"]));
    await files.put(id, new Blob(["second"]));
    expect(await (await files.get(id))?.text()).toBe("first");
  });
});
