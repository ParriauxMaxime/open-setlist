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
  content: string; // raw ChordPro body
  createdAt: number;
  updatedAt: number;
}
