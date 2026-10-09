import type { Song } from "@db";
import { parse } from "@domain/chordpro/parser";
import { type PartView, viewPitch } from "@domain/chordpro/visibility";
import { formatKey, formatPitch } from "@domain/chords/notation";
import { parseCapo, transposeKey } from "@domain/chords/transpose";
import { INSTRUMENT_PITCH, writtenKey } from "@domain/parts";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNotation } from "../../shared/hooks/use-notation";

const CHIP_CLASS = "rounded-sm border border-border px-1 text-xs text-text-muted tabular-nums";

interface KeyChipsProps {
  song: Song | undefined;
  transposition: number;
  /** "My part": a transposing part also gets the key it reads ("Concert Dm · B♭ Em"). */
  partView?: PartView;
}

/** Effective key when transposed ("Dm → Em") and capo with sounding key ("Capo 3 · sounds F"). */
export function KeyChips({ song, transposition, partView }: KeyChipsProps) {
  const { t } = useTranslation();
  const notation = useNotation();
  const content = song?.content ?? "";
  const metadata = useMemo(() => parse(content).metadata, [content]);

  const key = song?.key || metadata.key;
  const capo = parseCapo(metadata.capo);
  const playedKey = transposition ? transposeKey(key, transposition) : undefined;
  // `{key}` is the key of the chord shapes; the capo raises what the audience hears.
  const soundingKey = capo === undefined ? undefined : transposeKey(key, transposition + capo);
  const concertKey = soundingKey ?? playedKey ?? key;
  const pitch = viewPitch(partView);
  const readKey = pitch === INSTRUMENT_PITCH.concert ? undefined : writtenKey(concertKey, pitch);

  if (!playedKey && capo === undefined && !readKey) return null;

  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {key && playedKey && (
        <span className={CHIP_CLASS} title={t("notation.transposedKey")}>
          {formatKey(key, notation)} → {formatKey(playedKey, notation)}
        </span>
      )}
      {capo !== undefined && (
        <span className={CHIP_CLASS}>
          {soundingKey
            ? t("notation.capoSounds", { capo, key: formatKey(soundingKey, notation) })
            : t("notation.capo", { capo })}
        </span>
      )}
      {concertKey && readKey && (
        <span
          className="rounded-sm border border-accent px-1 text-xs text-accent tabular-nums"
          title={t("myPart.writtenKeyTitle")}
        >
          {t("myPart.writtenKey", {
            concert: formatKey(concertKey, notation),
            pitch: formatPitch(pitch, notation),
            written: formatKey(readKey, notation),
          })}
        </span>
      )}
    </div>
  );
}
