import type { SongStatus } from "@domain/song-status";

export interface SongLinks {
  youtube?: string;
  spotify?: string;
  deezer?: string;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  bpm?: number;
  duration?: number; // seconds
  tags: string[];
  notes?: string;
  techNotes?: string;
  links?: SongLinks;
  transposition?: number; // semitones to transpose chords at render time
  scrollSpeed?: number; // auto-scroll speed 1–10; unset = derived from duration
  status?: SongStatus; // readiness; unset = "ready" (see @domain/song-status)
  content: string; // raw ChordPro body
  createdAt: number;
  updatedAt: number;
}
