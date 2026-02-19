import { getGuitarFingerings } from "@domain/chords/guitar";
import {
  CHORD_GROUPS,
  CHROMATIC_ROOTS,
  chordMidi,
  chordName,
  QUALITIES,
} from "@domain/chords/theory";
import { INSTRUMENT_OPTIONS, type InstrumentType } from "@domain/chords/types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FretboardDiagram } from "./components/fretboard-diagram";
import { KeyboardDiagram } from "./components/keyboard-diagram";

const INSTRUMENT_KEYS: Record<string, string> = {
  Guitar: "settings.instrument.guitar",
  Piano: "settings.instrument.piano",
};

export function ChordsPage() {
  const { t } = useTranslation();
  const [instrument, setInstrument] = useState<InstrumentType>("guitar");
  const [rootFilter, setRootFilter] = useState<string>("");

  const groups = useMemo(() => {
    return CHORD_GROUPS.map((group) => {
      const quality = QUALITIES[group.qualityId];

      let chords = group.roots.map((root) => ({
        root,
        name: chordName(root, group.qualityId),
      }));

      if (rootFilter) {
        chords = chords.filter((c) => c.root === rootFilter);
      }

      // For guitar: skip chords without fingerings
      if (instrument === "guitar") {
        chords = chords.filter((c) => getGuitarFingerings(c.name).length > 0);
      }

      return { label: quality.label, quality, chords };
    }).filter((g) => g.chords.length > 0);
  }, [instrument, rootFilter]);

  return (
    <div className="p-page">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{t("chordLib.title")}</h1>

        <div className="flex items-center gap-3">
          <select
            className="field-sm"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as InstrumentType)}
          >
            {INSTRUMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(INSTRUMENT_KEYS[opt.label] ?? opt.label)}
              </option>
            ))}
          </select>

          <select
            className="field-sm"
            value={rootFilter}
            onChange={(e) => setRootFilter(e.target.value)}
          >
            <option value="">{t("chordLib.allRoots")}</option>
            {CHROMATIC_ROOTS.map((note) => (
              <option key={note} value={note}>
                {note}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.label} className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-text-muted" title={group.quality.formula}>
            {group.label}
          </h2>
          <div className="flex flex-wrap gap-4">
            {instrument === "guitar" &&
              group.chords.flatMap((chord) =>
                getGuitarFingerings(chord.name).map((f) => (
                  <FretboardDiagram
                    key={`${chord.name}-${f.baseFret}${f.barres?.length ? "b" : ""}`}
                    name={chord.name}
                    frets={f.frets}
                    baseFret={f.baseFret}
                    barres={f.barres}
                  />
                )),
              )}
            {instrument === "piano" &&
              group.chords.map((chord) => (
                <KeyboardDiagram
                  key={chord.name}
                  name={chord.name}
                  midi={chordMidi(chord.root, group.quality.intervals)}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
