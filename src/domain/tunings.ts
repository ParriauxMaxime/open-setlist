export interface TuningString {
  /** Note name with octave, e.g. "E2" — matches usePitch sharp-only format */
  note: string;
  /** Reference frequency in Hz */
  frequency: number;
  /** Visual thickness tier (1 = thinnest, 6 = thickest) */
  gauge: number;
  /** Display label, e.g. "E" or "g" (lowercase = high octave re-entrant) */
  label: string;
}

export interface InstrumentTuning {
  id: string;
  /** i18n key suffix, e.g. "guitar" → tuner.instruments.guitar */
  nameKey: string;
  strings: TuningString[];
}

export const TUNINGS: InstrumentTuning[] = [
  {
    id: "guitar-standard",
    nameKey: "guitar",
    strings: [
      { note: "E2", frequency: 82.41, gauge: 6, label: "E" },
      { note: "A2", frequency: 110.0, gauge: 5, label: "A" },
      { note: "D3", frequency: 146.83, gauge: 4, label: "D" },
      { note: "G3", frequency: 196.0, gauge: 3, label: "G" },
      { note: "B3", frequency: 246.94, gauge: 2, label: "B" },
      { note: "E4", frequency: 329.63, gauge: 1, label: "E" },
    ],
  },
  {
    id: "bass-standard",
    nameKey: "bass",
    strings: [
      { note: "E1", frequency: 41.2, gauge: 6, label: "E" },
      { note: "A1", frequency: 55.0, gauge: 5, label: "A" },
      { note: "D2", frequency: 73.42, gauge: 4, label: "D" },
      { note: "G2", frequency: 98.0, gauge: 3, label: "G" },
    ],
  },
  {
    id: "ukulele-standard",
    nameKey: "ukulele",
    strings: [
      { note: "G4", frequency: 392.0, gauge: 3, label: "G" },
      { note: "C4", frequency: 261.63, gauge: 4, label: "C" },
      { note: "E4", frequency: 329.63, gauge: 2, label: "E" },
      { note: "A4", frequency: 440.0, gauge: 1, label: "A" },
    ],
  },
  {
    id: "violin-standard",
    nameKey: "violin",
    strings: [
      { note: "G3", frequency: 196.0, gauge: 4, label: "G" },
      { note: "D4", frequency: 293.66, gauge: 3, label: "D" },
      { note: "A4", frequency: 440.0, gauge: 2, label: "A" },
      { note: "E5", frequency: 659.25, gauge: 1, label: "E" },
    ],
  },
  {
    id: "banjo-open-g",
    nameKey: "banjo",
    strings: [
      { note: "G4", frequency: 392.0, gauge: 1, label: "g" },
      { note: "D3", frequency: 146.83, gauge: 4, label: "D" },
      { note: "G3", frequency: 196.0, gauge: 3, label: "G" },
      { note: "B3", frequency: 246.94, gauge: 2, label: "B" },
      { note: "D4", frequency: 293.66, gauge: 1, label: "D" },
    ],
  },
];
