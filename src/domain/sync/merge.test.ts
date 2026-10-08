import { mergeSnapshots } from "./merge";
import { makeSnapshot, makeSong } from "./test-fakes";

describe("mergeSnapshots", () => {
  const base = makeSnapshot([makeSong("a", 100), makeSong("b", 100)]);

  it("applies a remote deletion and keeps its tombstone", () => {
    const remote = makeSnapshot([makeSong("a", 100)], {
      tombstones: [{ type: "song", id: "b", deletedAt: 150 }],
    });
    const result = mergeSnapshots(base, remote, [], { base });
    expect(result.songs.map((s) => s.id)).toEqual(["a"]);
    expect(result.tombstones).toEqual([{ type: "song", id: "b", deletedAt: 150 }]);
    expect(result.unresolved).toEqual([]);
  });

  it("keeps a local edit made after the remote deletion and reports it unresolved", () => {
    const local = makeSnapshot([makeSong("a", 100), makeSong("b", 200)]);
    const remote = makeSnapshot([makeSong("a", 100)], {
      tombstones: [{ type: "song", id: "b", deletedAt: 150 }],
    });
    const result = mergeSnapshots(local, remote, [], { base });
    expect(result.songs.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.tombstones).toEqual([]);
    expect(result.unresolved).toEqual(["song:b"]);
  });

  it("follows resolutions for items changed on both sides", () => {
    const local = makeSnapshot([makeSong("a", 200, { title: "Mine" }), makeSong("b", 100)]);
    const remote = makeSnapshot([makeSong("a", 300, { title: "Theirs" }), makeSong("b", 100)]);
    expect(mergeSnapshots(local, remote, [], { base }).songs[0]?.title).toBe("Mine");
    const theirs = mergeSnapshots(local, remote, [], { base, resolutions: { "song:a": "theirs" } });
    expect(theirs.songs[0]?.title).toBe("Theirs");
    expect(theirs.unresolved).toEqual([]);
  });

  it("does not resurrect a locally deleted item the remote did not touch", () => {
    const local = makeSnapshot([makeSong("a", 100)]);
    const tombstones = [{ type: "song" as const, id: "b", deletedAt: 150 }];
    const result = mergeSnapshots(local, base, tombstones, { base });
    expect(result.songs.map((s) => s.id)).toEqual(["a"]);
    expect(result.tombstones).toEqual(tombstones);
  });
});
