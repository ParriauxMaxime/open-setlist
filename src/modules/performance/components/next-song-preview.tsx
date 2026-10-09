import type { Song } from "@db";
import { parse } from "@domain/chordpro/parser";
import { formatKey } from "@domain/chords/notation";
import { buildSongPreview, isSetBreak, setLabel } from "@domain/perform-tempo";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNotation } from "../../shared/hooks/use-notation";
import type { FlatEntry } from "../hooks/use-setlist-navigation";

interface NextSongPreviewProps {
  current: FlatEntry;
  next: FlatEntry;
  song: Song;
}

/**
 * Footer "next up" for setlists: key (as transposed), BPM and setup line, so
 * musicians can switch patches and instruments during the applause.
 */
export function NextSongPreview({ current, next, song }: NextSongPreviewProps) {
  const { t } = useTranslation();
  const notation = useNotation();
  const preview = useMemo(() => buildSongPreview(song, parse(song.content).setup), [song]);
  const nextSet = isSetBreak(current, next)
    ? setLabel(next, (setNumber) => t("performTempo.setNumber", { number: setNumber }))
    : undefined;
  const tempo = [
    preview.key && formatKey(preview.key, notation),
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
