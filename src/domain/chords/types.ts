/**
 * Instrument registry for chord diagrams.
 */

export const INSTRUMENTS = {
  guitar: "guitar",
  piano: "piano",
  ukulele: "ukulele",
  bass: "bass",
} as const;

export type InstrumentType = (typeof INSTRUMENTS)[keyof typeof INSTRUMENTS];

export const INSTRUMENT_VALUES: InstrumentType[] = Object.values(INSTRUMENTS);

/** Fretted instruments: their diagrams are chord boxes, the others a keyboard. */
export type FrettedInstrument = Exclude<InstrumentType, "piano">;
