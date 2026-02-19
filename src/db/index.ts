import Dexie, { type EntityTable } from "dexie";
import type { Setlist } from "./setlist";
import type { Song } from "./song";

export type { Setlist, SetlistSet } from "./setlist";
export type { Song } from "./song";

const db = new Dexie("OpenSetlist") as Dexie & {
  songs: EntityTable<Song, "id">;
  setlists: EntityTable<Setlist, "id">;
};

db.version(1).stores({
  songs: "id, title, artist, *tags, updatedAt",
  setlists: "id, name, date, updatedAt",
});

export { db };
