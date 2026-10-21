import { countPendingChanges } from "./pending";
import { makeSnapshot, makeSong } from "./test-fakes";

describe("countPendingChanges", () => {
  const synced = makeSnapshot([makeSong("a", 100), makeSong("b", 100)]);

  it("is zero right after a sync", () => {
    expect(countPendingChanges(synced, synced, [])).toBe(0);
  });

  it("counts songs added, edited and deleted since", () => {
    const local = { songs: [makeSong("a", 200), makeSong("c", 300)], setlists: [] };
    expect(countPendingChanges(local, synced, [{ type: "song", id: "b", deletedAt: 250 }])).toBe(3);
  });

  it("ignores a deletion of something never synced", () => {
    expect(countPendingChanges(synced, synced, [{ type: "song", id: "z", deletedAt: 250 }])).toBe(
      0,
    );
  });
});
