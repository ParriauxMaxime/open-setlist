/**
 * Instrument registry for chord diagrams.
 */

export type InstrumentType = "guitar" | "piano"; // | "bass" | "ukulele" | ...

export const INSTRUMENT_OPTIONS: { value: InstrumentType; label: string }[] = [
  { value: "guitar", label: "Guitar" },
  { value: "piano", label: "Piano" },
  // { value: "bass", label: "Bass" },
  // { value: "ukulele", label: "Ukulele" },
];
