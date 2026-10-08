import type { AppDatabase } from "@db";
import {
  pullAndDiff,
  pushSelected,
  type SyncReviewContext,
  SyncReviewRequiredError,
} from "./orchestrator";
import {
  createMemoryDb,
  FakeRemote,
  installMemoryLocalStorage,
  makeSnapshot,
  makeSong,
  putLocalSong,
  removeLocalSong,
  seedSynced,
} from "./test-fakes";
import { addTombstone, loadTombstones } from "./tombstones";

const PROFILE = "test-profile";

let db: AppDatabase;
let remote: FakeRemote;

beforeEach(() => {
  installMemoryLocalStorage();
  db = createMemoryDb();
  remote = new FakeRemote();
});

async function review(): Promise<SyncReviewContext> {
  const result = await pullAndDiff(remote, db, PROFILE);
  if ("status" in result) throw new Error(`Expected review, got ${result.status}`);
  return result;
}

async function localSongIds(): Promise<string[]> {
  return (await db.songs.toArray()).map((s) => s.id).sort();
}

function remoteSong(id: string) {
  return remote.snapshot?.songs.find((s) => s.id === id);
}

describe("sync: push conflict (bug 1)", () => {
  it("re-pulls and retries on top of the fresh remote when someone else pushed meanwhile", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));

    const ctx = await review();
    // Another member edits a different song between our pull and our push.
    remote.beforeNextPush = () =>
      remote.write(makeSnapshot([makeSong("a", 100), makeSong("b", 300, { title: "Theirs" })]));

    const result = await pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing);

    expect(result.status).toBe("synced");
    expect(remoteSong("a")?.title).toBe("Mine");
    expect(remoteSong("b")?.title).toBe("Theirs");
    const local = await db.songs.toArray();
    expect(local.find((s) => s.id === "b")?.title).toBe("Theirs");
    expect(local.find((s) => s.id === "a")?.title).toBe("Mine");
  });

  it("does not overwrite when the fresh remote changed an item being pushed", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));

    const ctx = await review();
    remote.beforeNextPush = () =>
      remote.write(makeSnapshot([makeSong("a", 300, { title: "Theirs" })]));

    await expect(pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing)).rejects.toMatchObject({
      name: "SyncReviewRequiredError",
    });
    expect(remoteSong("a")?.title).toBe("Theirs");
    expect((await db.songs.toArray())[0]?.title).toBe("Mine");
  });
});

describe("sync: remote deletions (bug 2)", () => {
  it("applies a remote deletion to an unchanged local item", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    remote.write(
      makeSnapshot([makeSong("a", 100)], {
        tombstones: [{ type: "song", id: "b", deletedAt: Date.now() }],
      }),
    );

    const ctx = await review();
    expect(ctx.diff.incoming).toEqual([expect.objectContaining({ id: "b", change: "deleted" })]);

    await pushSelected(remote, db, PROFILE, ctx, []);
    expect(await localSongIds()).toEqual(["a"]);
  });

  it("applies a remote deletion inferred from the baseline (no tombstone)", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    remote.write(makeSnapshot([makeSong("a", 100)]));

    const ctx = await review();
    await pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing);
    expect(await localSongIds()).toEqual(["a"]);
  });
});

describe("sync: tombstones (bug 3)", () => {
  it("keeps remote and local tombstones through the merge, the local import and the push", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100), makeSong("c", 100)]);
    remote.write(
      makeSnapshot([makeSong("a", 100), makeSong("c", 100)], {
        tombstones: [{ type: "song", id: "b", deletedAt: Date.now() }],
      }),
    );
    removeLocalSong(db, "c");
    addTombstone(PROFILE, "song", "c");

    const ctx = await review();
    await pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing);

    expect(await localSongIds()).toEqual(["a"]);
    expect(remote.snapshot?.songs.map((s) => s.id)).toEqual(["a"]);
    const pushedTombstones = (remote.snapshot?.tombstones ?? []).map((t) => t.id).sort();
    expect(pushedTombstones).toEqual(["b", "c"]);
    const localTombstones = loadTombstones(PROFILE)
      .map((t) => t.id)
      .sort();
    expect(localTombstones).toEqual(["b", "c"]);
  });
});

describe("sync: per-item conflicts", () => {
  it("detects an item changed on both sides and leaves it out of incoming/outgoing", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    putLocalSong(db, makeSong("a", 200, { content: "[C]mine\n[G]Line two\nextra" }));
    remote.write(
      makeSnapshot([makeSong("a", 300, { title: "Renamed", key: "G" }), makeSong("b", 100)]),
    );

    const ctx = await review();

    expect(ctx.diff.incoming).toEqual([]);
    expect(ctx.diff.outgoing).toEqual([]);
    expect(ctx.diff.conflicts).toEqual([
      expect.objectContaining({
        type: "song",
        id: "a",
        local: { deleted: false, name: "Song a", at: 200, size: 3 },
        remote: { deleted: false, name: "Renamed", at: 300, size: 2 },
        changedFields: expect.arrayContaining(["title", "key", "content"]),
        onlyLocal: 2,
        onlyRemote: 1,
      }),
    ]);
  });

  it("refuses to push while a conflict is unresolved, without writing anything", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));
    remote.write(makeSnapshot([makeSong("a", 300, { title: "Theirs" })]));
    const version = remote.version;

    const ctx = await review();
    await expect(pushSelected(remote, db, PROFILE, ctx, [])).rejects.toBeInstanceOf(
      SyncReviewRequiredError,
    );
    expect(remote.version).toBe(version);
    expect((await db.songs.toArray())[0]?.title).toBe("Mine");
  });

  it("keep mine pushes the local version", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));
    remote.write(makeSnapshot([makeSong("a", 300, { title: "Theirs" })]));

    const ctx = await review();
    await pushSelected(remote, db, PROFILE, ctx, [], { "song:a": "mine" });

    expect(remoteSong("a")?.title).toBe("Mine");
    expect((await db.songs.toArray())[0]?.title).toBe("Mine");
    // Next sync is clean even though "mine" is older than the version it replaced.
    expect(await pullAndDiff(remote, db, PROFILE)).toMatchObject({ status: "up-to-date" });
  });

  it("take theirs applies the remote version locally without pushing", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));
    remote.write(makeSnapshot([makeSong("a", 300, { title: "Theirs" })]));
    const pushes = remote.pushCount;

    const ctx = await review();
    await pushSelected(remote, db, PROFILE, ctx, [], { "song:a": "theirs" });

    expect(remote.pushCount).toBe(pushes);
    expect((await db.songs.toArray())[0]?.title).toBe("Theirs");
    expect(await pullAndDiff(remote, db, PROFILE)).toMatchObject({ status: "up-to-date" });
  });

  it("reports a remote deletion of a locally edited item as a conflict", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    const deletedAt = Date.now();
    remote.write(
      makeSnapshot([makeSong("a", 100)], { tombstones: [{ type: "song", id: "b", deletedAt }] }),
    );
    putLocalSong(db, makeSong("b", deletedAt + 1000, { title: "Edited after deletion" }));

    const ctx = await review();
    expect(ctx.diff.incoming).toEqual([]);
    expect(ctx.diff.conflicts).toEqual([
      expect.objectContaining({
        id: "b",
        local: expect.objectContaining({ deleted: false }),
        remote: { deleted: true, name: null, at: deletedAt, size: null },
      }),
    ]);

    // Keep mine: the song comes back for everyone and its tombstone is dropped.
    await pushSelected(remote, db, PROFILE, ctx, [], { "song:b": "mine" });
    expect(remoteSong("b")?.title).toBe("Edited after deletion");
    expect(remote.snapshot?.tombstones ?? []).toEqual([]);
    expect(await localSongIds()).toEqual(["a", "b"]);
  });

  it("without a baseline, applies a remote tombstone newer than the local item", async () => {
    putLocalSong(db, makeSong("a", 100));
    putLocalSong(db, makeSong("b", 100));
    remote.write(
      makeSnapshot([makeSong("a", 100)], {
        tombstones: [{ type: "song", id: "b", deletedAt: Date.now() }],
      }),
    );

    const ctx = await review();
    expect(ctx.diff.conflicts).toEqual([]);
    expect(ctx.diff.incoming).toEqual([expect.objectContaining({ id: "b", change: "deleted" })]);
  });

  it("re-pull after a push conflict surfaces a new conflict instead of guessing", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Pushing" }));
    putLocalSong(db, makeSong("b", 200, { title: "Not selected" }));

    const ctx = await review();
    remote.beforeNextPush = () =>
      remote.write(makeSnapshot([makeSong("a", 100), makeSong("b", 300, { title: "Theirs" })]));
    const onlyA = ctx.diff.outgoing.filter((c) => c.id === "a");

    const error = await pushSelected(remote, db, PROFILE, ctx, onlyA).catch((e) => e);
    expect(error).toBeInstanceOf(SyncReviewRequiredError);
    expect((error as SyncReviewRequiredError).ctx.diff.conflicts.map((c) => c.id)).toEqual(["b"]);
    expect(remoteSong("a")?.title).toBe("Song a");
  });

  it("refuses to sync if local data changed after the review was computed", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    remote.write(makeSnapshot([makeSong("a", 100), makeSong("d", 100)]));
    const ctx = await review();
    // Edited in another tab while the review screen was open.
    putLocalSong(db, makeSong("a", 500, { title: "Other tab" }));
    const version = remote.version;

    const error = await pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing).catch((e) => e);

    expect(error).toBeInstanceOf(SyncReviewRequiredError);
    expect((error as SyncReviewRequiredError).ctx.diff.outgoing).toEqual([
      expect.objectContaining({ id: "a", change: "modified" }),
    ]);
    expect(remote.version).toBe(version);
    expect((await db.songs.toArray())[0]?.title).toBe("Other tab");
  });
});

describe("sync: no-op and pull-only", () => {
  it("does not push when nothing changed", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    const pushes = remote.pushCount;

    const result = await pullAndDiff(remote, db, PROFILE);

    expect(result).toMatchObject({ status: "up-to-date" });
    expect(remote.pushCount).toBe(pushes);
  });

  it("applies incoming changes without pushing when no outgoing change is selected", async () => {
    await seedSynced(db, remote, [makeSong("a", 100)]);
    remote.write(makeSnapshot([makeSong("a", 100), makeSong("d", 100)]));
    putLocalSong(db, makeSong("a", 200, { title: "Not ready" }));
    const pushes = remote.pushCount;

    const ctx = await review();
    await pushSelected(remote, db, PROFILE, ctx, []);

    expect(remote.pushCount).toBe(pushes);
    expect(await localSongIds()).toEqual(["a", "d"]);
    const next = await review();
    expect(next.diff.incoming).toEqual([]);
    expect(next.diff.outgoing).toEqual([expect.objectContaining({ id: "a", change: "modified" })]);
  });

  it("a deselected local edit does not revert a remote change to another item", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Not ready" }));
    putLocalSong(db, makeSong("c", 200));
    remote.write(makeSnapshot([makeSong("a", 100), makeSong("b", 300, { title: "Theirs" })]));

    const ctx = await review();
    const onlyC = ctx.diff.outgoing.filter((c) => c.id === "c");
    await pushSelected(remote, db, PROFILE, ctx, onlyC);

    expect(remoteSong("a")?.title).toBe("Song a");
    expect(remoteSong("b")?.title).toBe("Theirs");
    expect(remoteSong("c")).toBeDefined();
  });

  it("gives up after bounded retries when the remote keeps moving", async () => {
    await seedSynced(db, remote, [makeSong("a", 100), makeSong("b", 100)]);
    putLocalSong(db, makeSong("a", 200, { title: "Mine" }));
    const ctx = await review();

    // Every push races with an unrelated write by someone else.
    const realPush = remote.push.bind(remote);
    let pushAttempts = 0;
    remote.push = async (snapshot, token) => {
      pushAttempts++;
      remote.write(makeSnapshot([makeSong("a", 100), makeSong("b", 1000 + pushAttempts)]));
      return realPush(snapshot, token);
    };

    await expect(pushSelected(remote, db, PROFILE, ctx, ctx.diff.outgoing)).rejects.toMatchObject({
      name: "ConflictError",
    });
    expect(pushAttempts).toBe(3);
    expect((await db.songs.toArray()).find((s) => s.id === "a")?.title).toBe("Mine");
  });
});
