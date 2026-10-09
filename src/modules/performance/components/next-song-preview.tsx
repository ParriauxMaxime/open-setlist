import type { Song } from "@db";
import { parse } from "@domain/chordpro/parser";
import { type PartView, viewPitch, writtenPitchShift } from "@domain/chordpro/visibility";
import { formatKey, formatPitch } from "@domain/chords/notation";
import { parseCapo } from "@domain/chords/transpose";
import { buildSongPreview, isSetBreak, setLabel } from "@domain/perform-tempo";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNotation } from "../../shared/hooks/use-notation";
import type { FlatEntry } from "../hooks/use-setlist-navigation";

interface NextSongPreviewProps {
  current: FlatEntry;
  next: FlatEntry;
  song: Song;
  /** "My part": a transposing part sees the key it reads ("B♭ Am") instead of concert. */
  partView?: PartView;
}

/**
 * Footer "next up" for setlists: key (as transposed), BPM and setup line, so
 * musicians can switch patches and instruments during the applause.
 */
export function NextSongPreview({ current, next, song, partView }: NextSongPreviewProps) {
  const { t } = useTranslation();
  const notation = useNotation();
  const preview = useMemo(() => {
    const chart = parse(song.content);
    // Capo-aware like the header: a transposing part reads from the sounding key
    const shift = writtenPitchShift(partView, parseCapo(chart.metadata.capo));
    return buildSongPreview(song, chart.setup, shift);
  }, [song, partView]);
  const nextSet = isSetBreak(current, next)
    ? setLabel(next, (setNumber) => t("performTempo.setNumber", { number: setNumber }))
    : undefined;
  const key = preview.writtenKey
    ? t("performTempo.writtenKey", {
        pitch: formatPitch(viewPitch(partView), notation),
        key: formatKey(preview.writtenKey, notation),
      })
    : preview.key && formatKey(preview.key, notation);
  const tempo = [
    key,
    preview.bpm !== undefined ? t("performTempo.bpmValue", { bpm: preview.bpm }) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="truncate font-medium">
        {nextSet && <span className="text-accent">{nextSet} · </span>}
        {song.title}
      </div>
      {tempo || preview.setup ? (
        <div className="truncate text-xs text-text-muted">
          {tempo}
          {/* Phones only have room for key and tempo */}
          {preview.setup && (
            <span className="hidden sm:inline">
              {tempo && " · "}
              {preview.setup}
            </span>
          )}
        </div>
      ) : (
        song.artist && <div className="truncate text-xs opacity-60">{song.artist}</div>
      )}
    </>
  );
}
