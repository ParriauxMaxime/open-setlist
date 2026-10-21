export interface Setlist {
  id: string;
  name: string;
  date?: string;
  venue?: string;
  sets: SetlistSet[];
  notes?: string;
  expectedDuration?: number; // seconds
  /** Song id → tech note for this setlist, in place of the song's own. */
  techNotes?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface SetlistSet {
  name: string;
  songIds: string[];
  notes?: string;
}
