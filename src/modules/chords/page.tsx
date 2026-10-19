import { getFingerings } from "@domain/chords/fingerings";
import { formatChord } from "@domain/chords/notation";
import {
  CHORD_GROUPS,
  CHROMATIC_ROOTS,
  chordName,
  parseChord,
  pianoVoicing,
  QUALITIES,
  QUALITY_IDS,
  type QualityId,
} from "@domain/chords/theory";
import { INSTRUMENT_VALUES, type InstrumentType } from "@domain/chords/types";
import { loadPreferences } from "@domain/preferences";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../design-system/components/card";
import { PageHeader } from "../design-system/components/page-header";
import { useNotation } from "../shared/hooks/use-notation";
import { FretboardDiagram } from "./components/fretboard-diagram";
import { KeyboardDiagram } from "./components/keyboard-diagram";

function pianoNotes(name: string) {
  const parsed = parseChord(name);
  return parsed ? pianoVoicing(parsed) : undefined;
}

export function ChordsPage() {
  const { t } = useTranslation();
  const notation = useNotation();
  const [instrument, setInstrument] = useState<InstrumentType>(
    () => loadPreferences().favoriteInstrument,
  );
  const [rootFilter, setRootFilter] = useState<string>("");
  const [qualityFilter, setQualityFilter] = useState<QualityId | "">("");

  const groups = useMemo(() => {
    return CHORD_GROUPS.filter((g) => !qualityFilter || g.qualityId === qualityFilter)
      .map((group) => {
        const roots = rootFilter ? group.roots.filter((r) => r === rootFilter) : group.roots;
        const chords = roots.map((root) => {
          const name = chordName(root, group.qualityId);
          return instrument === "piano"
            ? { name, fingerings: [], piano: pianoNotes(name) }
            : { name, fingerings: getFingerings(instrument, name) };
        });
        return { qualityId: group.qualityId, quality: QUALITIES[group.qualityId], chords };
      })
      .filter((g) => g.chords.length > 0);
  }, [instrument, rootFilter, qualityFilter]);

  return (
    <div className="p-page">
      <PageHeader
        title={t("chordLib.title")}
        subtitle={t("chordLib.subtitle")}
        actions={
          <div className="grid grid-cols-3 gap-2 sm:w-[32rem]">
            <select
              className="field-sm"
              aria-label={t("chordLib.instrument")}
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as InstrumentType)}
            >
              {INSTRUMENT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`settings.instrument.${value}`)}
                </option>
              ))}
            </select>

            <select
              className="field-sm"
              aria-label={t("chordLib.root")}
              value={rootFilter}
              onChange={(e) => setRootFilter(e.target.value)}
            >
              <option value="">{t("chordLib.allRoots")}</option>
              {CHROMATIC_ROOTS.map((note) => (
                <option key={note} value={note}>
                  {formatChord(note, notation)}
                </option>
              ))}
            </select>

            <select
              className="field-sm"
              aria-label={t("chordLib.quality")}
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value as QualityId | "")}
            >
              <option value="">{t("chordLib.allQualities")}</option>
              {QUALITY_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`chordLib.qualities.${id}`)}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {groups.map((group) => (
        <Card
          key={group.qualityId}
          title={
            <>
              {t(`chordLib.qualities.${group.qualityId}`)}
              <span className="text-xs font-normal text-text-faint">{group.quality.formula}</span>
            </>
          }
        >
          <div className="flex flex-wrap justify-center gap-4 p-4 sm:justify-start">
            {group.chords.flatMap((chord) =>
              chord.fingerings.map((f) => (
                <FretboardDiagram
                  key={`${chord.name}-${f.frets.join(".")}`}
                  name={formatChord(chord.name, notation)}
                  frets={f.frets}
                  baseFret={f.baseFret}
                  barres={f.barres}
                />
              )),
            )}
            {group.chords.map(
              (chord) =>
                chord.piano && (
                  <KeyboardDiagram
                    key={chord.name}
                    name={formatChord(chord.name, notation)}
                    midi={chord.piano.notes}
                    bass={chord.piano.bass}
                  />
                ),
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
