import type { Song } from "@db";
import type { PartView } from "@domain/chordpro/visibility";
import type { FlatEntry } from "../hooks/use-setlist-navigation";
import { NextSongPreview } from "./next-song-preview";

interface PerformFooterProps {
  visible: boolean;
  current: FlatEntry;
  /** Next setlist entry; when given, the footer previews the next song and set breaks. */
  next?: FlatEntry;
  prevSong: Song | undefined;
  nextSong: Song | undefined;
  /** "My part": the preview shows a transposing part's written key. */
  partView?: PartView;
}

export function PerformFooter({
  visible,
  current,
  next,
  prevSong,
  nextSong,
  partView,
}: PerformFooterProps) {
  return (
    <div className="perform-footer" data-visible={visible}>
      <div className="perform-footer-inner">
        <div className="grid grid-cols-3 items-center gap-4 px-4 py-2.5 text-sm">
          {/* Previous song */}
          <div className="min-w-0 text-text-faint">
            {prevSong && (
              <>
                <div className="truncate font-medium">{prevSong.title}</div>
                {prevSong.artist && (
                  <div className="truncate text-xs opacity-60">{prevSong.artist}</div>
                )}
              </>
            )}
          </div>

          {/* Set position */}
          <div className="text-center text-text-muted">
            {current.setName} · {current.indexInSet + 1}/{current.setSize}
          </div>

          {/* Next song */}
          <div className="min-w-0 text-right text-text-faint">
            {nextSong && next && (
              <NextSongPreview current={current} next={next} song={nextSong} partView={partView} />
            )}
            {nextSong && !next && (
              <>
                <div className="truncate font-medium">{nextSong.title}</div>
                {nextSong.artist && (
                  <div className="truncate text-xs opacity-60">{nextSong.artist}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
