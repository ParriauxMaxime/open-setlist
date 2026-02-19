export interface Song {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  bpm?: number;
  duration?: number; // seconds
  tags: string[];
  notes?: string;
  content: string; // raw ChordPro body
  createdAt: number;
  updatedAt: number;
}
