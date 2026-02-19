import { addProfile, ensureDefaultProfile, setActiveProfileId } from "@domain/profiles";
import { migrateUnkeyedConfig } from "@domain/sync/config";
import { migrateUnkeyedTombstones } from "@domain/sync/tombstones";
import Dexie from "dexie";
import { type AppDatabase, openProfileDb } from ".";
import { seedIfEmpty } from "./seed";

/**
 * Run once on startup.
 * - If the old "OpenSetlist" database exists, migrate its data into a new
 *   profile-keyed database and delete the old one.
 * - Otherwise, ensure a default profile exists and seed if empty.
 *
 * Returns the active profile's database, ready to use.
 */
export async function migrateAndInit(): Promise<{ db: AppDatabase; profileId: string }> {
  const oldDbExists = await Dexie.exists("OpenSetlist");

  if (oldDbExists) {
    return migrateOldDatabase();
  }

  // No old database — just ensure a default profile and seed
  const profileId = ensureDefaultProfile();
  const db = openProfileDb(profileId);
  await seedIfEmpty(db);
  return { db, profileId };
}

async function migrateOldDatabase(): Promise<{ db: AppDatabase; profileId: string }> {
  // Open the old database to read its data
  const oldDb = new Dexie("OpenSetlist") as AppDatabase;
  oldDb.version(1).stores({
    songs: "id, title, artist, *tags, updatedAt",
    setlists: "id, name, date, updatedAt",
  });

  const [songs, setlists] = await Promise.all([oldDb.songs.toArray(), oldDb.setlists.toArray()]);

  // Create a default profile
  const profileId = crypto.randomUUID();
  addProfile({ id: profileId, name: "Personal", avatar: "\u{1F3B5}", createdAt: Date.now() });
  setActiveProfileId(profileId);

  // Copy data into the new profile-keyed database
  const newDb = openProfileDb(profileId);
  if (songs.length > 0) {
    await newDb.songs.bulkAdd(songs);
  }
  if (setlists.length > 0) {
    await newDb.setlists.bulkAdd(setlists);
  }

  // Migrate sync config and tombstones to profile-keyed format
  migrateUnkeyedConfig(profileId);
  migrateUnkeyedTombstones(profileId);

  // Close and delete the old database
  oldDb.close();
  await Dexie.delete("OpenSetlist");

  return { db: newDb, profileId };
}
