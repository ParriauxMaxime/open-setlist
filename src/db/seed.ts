import { parse } from "@domain/chordpro/parser";
import type { AppDatabase } from ".";
import type { Setlist } from "./setlist";
import type { Song } from "./song";

// Load all .chopro files from fixtures at build time
const fixtureContext = require.context("../../fixtures", false, /\.chopro$/);
const FIXTURES: string[] = fixtureContext.keys().map((key: string) => fixtureContext(key));

function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parts = raw.split(":");
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(raw) || undefined;
}

function buildSong(content: string): Song {
  const { metadata } = parse(content);
  const now = Date.now();
  const slug = (metadata.title ?? "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const links: Record<string, string> = {};
  if (metadata.youtube) links.youtube = metadata.youtube;
  const hasLinks = Object.keys(links).length > 0;

  return {
    id: `seed-${slug}`,
    title: metadata.title ?? "Untitled",
    artist: metadata.artist,
    key: metadata.key,
    bpm: metadata.bpm ? Number(metadata.bpm) : undefined,
    duration: parseDuration(metadata.duration),
    tags: metadata.tags ? metadata.tags.split(",").map((t) => t.trim()) : [],
    notes: metadata.notes,
    links: hasLinks ? links : undefined,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

const SEED_SETLISTS: Setlist[] = [
  {
    id: "seed-reggae-night",
    name: "Reggae Night",
    date: "2026-03-15",
    venue: "The Blue Note",
    sets: [
      {
        name: "Set 1",
        songIds: ["seed-three-little-birds", "seed-no-woman-no-cry"],
        notes: "Open upbeat, build into the crowd favorite",
      },
      {
        name: "Set 2",
        songIds: ["seed-redemption-song"],
        notes: "Acoustic encore — just voice and guitar",
      },
    ],
    notes: "Keep it relaxed, let the crowd sing along on the choruses.",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-acoustic-session",
    name: "Acoustic Session",
    date: "2026-04-02",
    venue: "Garden Terrace Café",
    sets: [
      {
        name: "Full Set",
        songIds: ["seed-redemption-song", "seed-three-little-birds", "seed-no-woman-no-cry"],
      },
    ],
    notes: "Intimate setting, all acoustic. No PA — play quietly.",
    createdAt: 0,
    updatedAt: 0,
  },
];

export async function seedIfEmpty(db: AppDatabase): Promise<void> {
  const count = await db.songs.count();
  if (count > 0) return;

  const now = Date.now();
  const songs = FIXTURES.map(buildSong);
  const setlists = SEED_SETLISTS.map((s) => ({
    ...s,
    createdAt: now,
    updatedAt: now,
  }));

  await db.songs.bulkAdd(songs);
  await db.setlists.bulkAdd(setlists);
}
