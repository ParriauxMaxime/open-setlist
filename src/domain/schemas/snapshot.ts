import { z } from "zod";
import { setlistSchema } from "./setlist";
import { songSchema } from "./song";

export const tombstoneSchema = z.object({
  type: z.enum(["song", "setlist"]),
  id: z.string(),
  deletedAt: z.number(),
});

export const snapshotSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.number(),
  songs: z.array(songSchema),
  setlists: z.array(setlistSchema),
  tombstones: z.array(tombstoneSchema).optional(),
});
