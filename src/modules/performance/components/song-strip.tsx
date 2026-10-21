import type { Song, SongAttachment } from "@db";
import type { PartView } from "@domain/chordpro/visibility";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChordProView, type ChordTapInfo } from "./chordpro-view";
import { ScoreView } from "./score-view";

interface SongStripProps {
  containerRef: RefObject<HTMLDivElement | null>;
  stripRef: RefObject<HTMLDivElement | null>;
  currentPanelRef: RefObject<HTMLDivElement | null>;
  prevSong: Song | undefined;
  currentSong: Song | undefined;
  nextSong: Song | undefined;
  prevTransposition?: number;
  currentTransposition?: number;
  nextTransposition?: number;
  prevSongStyle?: CSSProperties;
  currentSongStyle?: CSSProperties;
  nextSongStyle?: CSSProperties;
  onChordTap?: (info: ChordTapInfo) => void;
  partView?: PartView;
  /** The musician's private note card for a song, if any. */
  renderNote?: (song: Song) => ReactNode;
  /** The sheet music to show instead of the chart, if any. */
  scoreFor?: (song: Song) => SongAttachment | undefined;
  /** Leaving for the song's editor, whose Save comes back here. */
  onEditSong?: () => void;
}

export function SongStrip({
  containerRef,
  stripRef,
  currentPanelRef,
  prevSong,
  currentSong,
  nextSong,
  prevTransposition,
  currentTransposition,
  nextTransposition,
  prevSongStyle,
  currentSongStyle,
  nextSongStyle,
  onChordTap,
  partView,
  renderNote,
  scoreFor,
  onEditSong,
}: SongStripProps) {
  const { t } = useTranslation();

  const renderSong = (song: Song, transposition: number | undefined) => {
    const score = scoreFor?.(song);
    if (score) return <ScoreView key={score.id} attachment={score} note={renderNote?.(song)} />;
    return (
      <ChordProView
        content={song.content}
        songId={song.id}
        transposition={transposition}
        note={renderNote?.(song)}
        onChordTap={onChordTap}
        partView={partView}
        onEditSong={onEditSong}
      />
    );
  };

  // pan-y: the browser scrolls vertically, useSwipeStrip handles horizontal drags and taps
  return (
    <div ref={containerRef} className="min-h-0 flex-1 touch-pan-y overflow-hidden">
      <div ref={stripRef} className="relative h-full">
        {/* Previous song panel */}
        <div
          className="absolute inset-y-0 right-full w-full touch-pan-y overflow-y-auto px-4 py-4"
          data-song-panel
          style={prevSongStyle}
        >
          {prevSong && renderSong(prevSong, prevTransposition)}
        </div>
        {/* Current song panel */}
        <div
          ref={currentPanelRef}
          className="h-full touch-pan-y overflow-y-auto px-4 py-4"
          data-song-panel
          style={currentSongStyle}
        >
          {currentSong ? (
            renderSong(currentSong, currentTransposition)
          ) : (
            <p className="text-text-faint">{t("perform.songNotFound")}</p>
          )}
        </div>
        {/* Next song panel */}
        <div
          className="absolute inset-y-0 left-full w-full touch-pan-y overflow-y-auto px-4 py-4"
          data-song-panel
          style={nextSongStyle}
        >
          {nextSong && renderSong(nextSong, nextTransposition)}
        </div>
      </div>
    </div>
  );
}
