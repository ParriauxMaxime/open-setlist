import { z } from "zod";

export const setlistSetSchema = z.object({
  name: z.string().min(1, "Set name is required"),
  songIds: z.array(z.string()),
  notes: z.string().optional(),
});

export const setlistSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  date: z.string().optional(),
  venue: z.string().optional(),
  sets: z.array(setlistSetSchema),
  notes: z.string().optional(),
  expectedDuration: z.number().int().positive().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const setlistFormSchema = setlistSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SetlistFormValues = z.infer<typeof setlistFormSchema>;
