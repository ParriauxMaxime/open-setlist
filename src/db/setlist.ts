export interface Setlist {
  id: string;
  name: string;
  date?: string;
  venue?: string;
  sets: SetlistSet[];
  notes?: string;
  expectedDuration?: number; // seconds
  createdAt: number;
  updatedAt: number;
}

export interface SetlistSet {
  name: string;
  songIds: string[];
  notes?: string;
}
