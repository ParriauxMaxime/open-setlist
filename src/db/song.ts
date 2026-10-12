import type { SongStatus } from "@domain/song-status";

export interface SongLinks {
  youtube?: string;
  spotify?: string;
  deezer?: string;
}

/** Sheet music file of a song; its bytes are in the `files` table under the same id. */
export interface SongAttachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number; // bytes
  part?: string; // the instrument it is written for; unset = everyone
}

export interface SongFile {
  id: string;
  data: Blob;
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
  attachments?: SongAttachment[];
  /** Sound code per part (`{ drums: "12" }`), sent as MIDI on stage; see @domain/midi/patch. */
  patches?: Record<string, string>;
  content: string; // raw ChordPro body
  createdAt: number;
  updatedAt: number;
}
