import Dexie, { type EntityTable } from "dexie";
import type { Setlist } from "./setlist";
import type { Song, SongFile } from "./song";
import type { SyncStateRow } from "./sync-state";

export type { Setlist, SetlistSet } from "./setlist";
export type { Song, SongAttachment, SongFile } from "./song";
export type { SyncStateRow } from "./sync-state";

export type AppDatabase = Dexie & {
  songs: EntityTable<Song, "id">;
  setlists: EntityTable<Setlist, "id">;
  files: EntityTable<SongFile, "id">;
  _syncState: EntityTable<SyncStateRow, "key">;
};

export function openProfileDb(profileId: string): AppDatabase {
  const db = new Dexie(`open-setlist-${profileId}`) as AppDatabase;
  db.version(1).stores({
    songs: "id, title, artist, *tags, updatedAt",
    setlists: "id, name, date, updatedAt",
  });
  db.version(2).stores({
    songs: "id, title, artist, *tags, updatedAt",
    setlists: "id, name, date, updatedAt",
    _syncState: "key",
  });
  db.version(3).stores({
    songs: "id, title, artist, *tags, updatedAt",
    setlists: "id, name, date, updatedAt",
    files: "id",
    _syncState: "key",
  });
  return db;
}
