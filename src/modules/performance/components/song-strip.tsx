import type { Song } from "@db";
import type { CSSProperties, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChordProView, type ChordTapInfo } from "./chordpro-view";

interface SongStripProps {
  containerRef: RefObject<HTMLDivElement | null>;
  stripRef: RefObject<HTMLDivElement | null>;
  currentPanelRef: RefObject<HTMLDivElement | null>;
  onClick: () => void;
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
}

export function SongStrip({
  containerRef,
  stripRef,
  currentPanelRef,
  onClick,
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
}: SongStripProps) {
  const { t } = useTranslation();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: swipe/tap handled imperatively
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by global keydown listener
    <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden" onClick={onClick}>
      <div ref={stripRef} className="relative h-full">
        {/* Previous song panel */}
        <div
          className="absolute inset-y-0 right-full w-full overflow-y-auto px-4 py-4"
          style={prevSongStyle}
        >
          {prevSong && (
            <ChordProView
              content={prevSong.content}
              transposition={prevTransposition}
              onChordTap={onChordTap}
            />
          )}
        </div>
        {/* Current song panel */}
        <div
          ref={currentPanelRef}
          className="h-full overflow-y-auto px-4 py-4"
          style={currentSongStyle}
        >
          {currentSong ? (
            <ChordProView
              content={currentSong.content}
              transposition={currentTransposition}
              onChordTap={onChordTap}
            />
          ) : (
            <p className="text-text-faint">{t("perform.songNotFound")}</p>
          )}
        </div>
        {/* Next song panel */}
        <div
          className="absolute inset-y-0 left-full w-full overflow-y-auto px-4 py-4"
          style={nextSongStyle}
        >
          {nextSong && (
            <ChordProView
              content={nextSong.content}
              transposition={nextTransposition}
              onChordTap={onChordTap}
            />
          )}
        </div>
      </div>
    </div>
  );
}
