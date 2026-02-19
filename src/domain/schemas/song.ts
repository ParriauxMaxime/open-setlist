import { z } from "zod";
import { MUSICAL_KEY_LIST } from "../music";

const songLinksSchema = z
  .object({
    youtube: z.string().optional(),
    spotify: z.string().optional(),
    deezer: z.string().optional(),
  })
  .optional();

export const songSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  artist: z.string().optional(),
  key: z.enum(MUSICAL_KEY_LIST as [string, ...string[]]).optional(),
  bpm: z.number().int().positive().optional(),
  duration: z.number().int().positive().optional(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
  links: songLinksSchema,
  content: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const songFormSchema = songSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SongFormValues = z.infer<typeof songFormSchema>;
