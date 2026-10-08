import type { Snapshot } from "@db/snapshot";
import type { Song } from "@db/song";
import en from "../i18n/locales/en.json";
import fr from "../i18n/locales/fr.json";
import { snapshotSchema } from "./schemas/snapshot";
import { songFormSchema, songSchema } from "./schemas/song";
import {
  ACTIVE_STATUS_FILTER,
  countNotReadySongs,
  DEFAULT_SONG_STATUS,
  isSongNotReady,
  matchesStatusFilter,
  parseSongStatus,
  resolveSongStatus,
  SONG_STATUS_FILTER_LIST,
  SONG_STATUS_LIST,
  SongStatus,
  songStatusLabelKey,
  songStatusRank,
} from "./song-status";

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: "s1",
    title: "Song",
    tags: [],
    content: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("song status enum", () => {
  it("lists every status in lifecycle order", () => {
    expect(SONG_STATUS_LIST).toEqual(["idea", "rehearsing", "ready", "retired"]);
    expect([...SONG_STATUS_LIST].sort()).toEqual(Object.values(SongStatus).sort());
  });

  it("ranks statuses by lifecycle, unset songs as ready", () => {
    const ranks = SONG_STATUS_LIST.map(songStatusRank);
    expect(ranks).toEqual([0, 1, 2, 3]);
    expect(songStatusRank(undefined)).toBe(songStatusRank(SongStatus.Ready));
  });

  it("treats an unset status as ready", () => {
    expect(DEFAULT_SONG_STATUS).toBe(SongStatus.Ready);
    expect(resolveSongStatus(undefined)).toBe(SongStatus.Ready);
    expect(resolveSongStatus(SongStatus.Idea)).toBe(SongStatus.Idea);
  });

  it("flags only songs still being learned as not ready", () => {
    expect(isSongNotReady(SongStatus.Idea)).toBe(true);
    expect(isSongNotReady(SongStatus.Rehearsing)).toBe(true);
    expect(isSongNotReady(SongStatus.Ready)).toBe(false);
    expect(isSongNotReady(SongStatus.Retired)).toBe(false);
    expect(isSongNotReady(undefined)).toBe(false);
  });

  it("parses known values only", () => {
    expect(parseSongStatus("rehearsing")).toBe(SongStatus.Rehearsing);
    expect(parseSongStatus("Ready")).toBeUndefined();
    expect(parseSongStatus(ACTIVE_STATUS_FILTER)).toBeUndefined();
    expect(parseSongStatus("")).toBeUndefined();
  });

  it.each([
    ["en", en],
    ["fr", fr],
  ])("has a %s label for every status", (_locale, messages) => {
    const labels = messages.songStatus as Record<string, string>;
    for (const status of SONG_STATUS_LIST) {
      const key = songStatusLabelKey(status);
      expect(key).toBe(`songStatus.${status}`);
      expect(labels[status]).toEqual(expect.any(String));
    }
    expect(labels.filterActive).toEqual(expect.any(String));
  });
});

describe("matchesStatusFilter", () => {
  it("shows every song without a filter", () => {
    for (const status of [...SONG_STATUS_LIST, undefined]) {
      expect(matchesStatusFilter(status, undefined)).toBe(true);
      expect(matchesStatusFilter(status, "")).toBe(true);
    }
  });

  it("hides only retired songs with the active filter", () => {
    expect(matchesStatusFilter(SongStatus.Retired, ACTIVE_STATUS_FILTER)).toBe(false);
    expect(matchesStatusFilter(SongStatus.Idea, ACTIVE_STATUS_FILTER)).toBe(true);
    expect(matchesStatusFilter(undefined, ACTIVE_STATUS_FILTER)).toBe(true);
  });

  it("matches a single status, unset counting as ready", () => {
    expect(matchesStatusFilter(SongStatus.Idea, SongStatus.Idea)).toBe(true);
    expect(matchesStatusFilter(SongStatus.Idea, SongStatus.Ready)).toBe(false);
    expect(matchesStatusFilter(undefined, SongStatus.Ready)).toBe(true);
  });

  it("offers the active filter first", () => {
    expect(SONG_STATUS_FILTER_LIST).toEqual([ACTIVE_STATUS_FILTER, ...SONG_STATUS_LIST]);
  });
});

describe("countNotReadySongs", () => {
  const songs = [
    song({ id: "idea", status: SongStatus.Idea }),
    song({ id: "rehearsing", status: SongStatus.Rehearsing }),
    song({ id: "ready", status: SongStatus.Ready }),
    song({ id: "retired", status: SongStatus.Retired }),
    song({ id: "legacy" }),
    undefined,
  ];

  it("counts songs still being learned across all sets", () => {
    const sets = [{ songIds: ["idea", "ready", "legacy"] }, { songIds: ["rehearsing", "retired"] }];
    expect(countNotReadySongs(sets, songs)).toBe(2);
  });

  it("counts a song present in several sets once", () => {
    const sets = [{ songIds: ["idea", "ready"] }, { songIds: ["idea"] }];
    expect(countNotReadySongs(sets, songs)).toBe(1);
  });

  it("ignores songs that are not in the setlist or not loaded", () => {
    expect(countNotReadySongs([{ songIds: ["ready", "missing"] }], songs)).toBe(0);
    expect(countNotReadySongs([{ songIds: [] }], songs)).toBe(0);
  });
});

describe("song schema status", () => {
  it("accepts every status and no status", () => {
    for (const status of SONG_STATUS_LIST) {
      expect(songSchema.parse(song({ status })).status).toBe(status);
    }
    const parsed = songSchema.parse(song());
    expect(parsed.status).toBeUndefined();
    expect("status" in parsed).toBe(false);
  });

  it("rejects unknown values", () => {
    expect(songSchema.safeParse({ ...song(), status: "learning" }).success).toBe(false);
    expect(songSchema.safeParse({ ...song(), status: "" }).success).toBe(false);
    expect(songSchema.safeParse({ ...song(), status: 1 }).success).toBe(false);
  });

  it("is part of the editor form values", () => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...form } = song({ status: SongStatus.Idea });
    expect(songFormSchema.parse(form).status).toBe(SongStatus.Idea);
  });
});

describe("snapshot round-trip", () => {
  it("keeps the status through export, JSON and import parsing", () => {
    const snapshot: Snapshot = {
      version: 2,
      exportedAt: 10,
      songs: [song({ id: "a", status: SongStatus.Rehearsing }), song({ id: "b" })],
      setlists: [],
    };
    const parsed = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed.songs[0].status).toBe(SongStatus.Rehearsing);
    expect(parsed.songs[1].status).toBeUndefined();
    expect(parsed.songs).toEqual(snapshot.songs);
  });
});
