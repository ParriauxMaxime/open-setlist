import { parseDuration } from "@domain/chordpro/directives";
import { parse } from "@domain/chordpro/parser";
import { loadProfiles } from "@domain/profiles";
import type { AppDatabase } from ".";
import type { Setlist } from "./setlist";
import type { Song } from "./song";

// Load all .chopro files from fixtures at build time
const fixtureContext = require.context("../../fixtures", false, /\.chopro$/);
const FIXTURES: string[] = fixtureContext.keys().map((key: string) => fixtureContext(key));

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
    techNotes: metadata.techNotes,
    links: hasLinks ? links : undefined,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

const SEED_SETLISTS: Setlist[] = [
  {
    id: "seed-classic-rock-night",
    name: "Classic Rock Night",
    date: "2026-03-08",
    venue: "The Warehouse",
    sets: [
      {
        name: "Set 1",
        songIds: [
          "seed-smoke-on-the-water",
          "seed-sweet-home-alabama",
          "seed-summer-of-69",
          "seed-eye-of-the-tiger",
          "seed-should-i-stay-or-should-i-go",
        ],
        notes: "High energy openers — keep the crowd moving",
      },
      {
        name: "Set 2",
        songIds: [
          "seed-hotel-california",
          "seed-sultans-of-swing",
          "seed-sweet-child-o-mine",
          "seed-livin-on-a-prayer",
        ],
        notes: "Build to the big sing-along closer",
      },
    ],
    notes: "Loud and proud. Full band, no acoustic breaks.",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-acoustic-sundown",
    name: "Acoustic Sundown",
    date: "2026-03-22",
    venue: "Garden Terrace Café",
    sets: [
      {
        name: "Full Set",
        songIds: [
          "seed-wish-you-were-here",
          "seed-redemption-song",
          "seed-jolene",
          "seed-stand-by-me",
          "seed-take-me-home-country-roads",
          "seed-let-it-be",
          "seed-wagon-wheel",
        ],
      },
    ],
    notes: "Intimate setting, all acoustic. No PA — play quietly.",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-crowd-pleasers",
    name: "Crowd Pleasers",
    date: "2026-04-12",
    venue: "Festival Main Stage",
    sets: [
      {
        name: "Set 1",
        songIds: [
          "seed-twist-and-shout",
          "seed-brown-eyed-girl",
          "seed-proud-mary",
          "seed-hey-ya",
          "seed-mr-brightside",
        ],
      },
      {
        name: "Set 2",
        songIds: [
          "seed-don-t-stop-believin",
          "seed-use-somebody",
          "seed-zombie",
          "seed-knockin-on-heaven-s-door",
          "seed-wonderwall",
        ],
        notes: "Wonderwall last — let the crowd take over",
      },
    ],
    notes: "Festival slot, 45 min. Every song a hit, no downtime.",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-latin-vibes",
    name: "Latin & Feel-Good Vibes",
    date: "2026-04-19",
    venue: "Rooftop Bar",
    sets: [
      {
        name: "Full Set",
        songIds: [
          "seed-la-bamba",
          "seed-three-little-birds",
          "seed-i-m-yours",
          "seed-riptide",
          "seed-have-you-ever-seen-the-rain",
          "seed-no-woman-no-cry",
        ],
      },
    ],
    notes: "Sunset set. Keep it warm and groovy.",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-brit-rock",
    name: "Brit Rock",
    date: "2026-05-03",
    venue: "The Crown Pub",
    sets: [
      {
        name: "Full Set",
        songIds: [
          "seed-wonderwall",
          "seed-don-t-look-back-in-anger",
          "seed-mr-brightside",
          "seed-zombie",
          "seed-use-somebody",
        ],
      },
    ],
    notes: "UK anthems. Expect the crowd to sing louder than you.",
    createdAt: 0,
    updatedAt: 0,
  },
];

export async function seedIfEmpty(db: AppDatabase, profileId: string): Promise<void> {
  const profile = loadProfiles().find((p) => p.id === profileId);
  if (!profile?.isDemo) return;

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
