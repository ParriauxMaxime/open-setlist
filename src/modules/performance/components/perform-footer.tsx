import type { Song } from "@db";
import type { FlatEntry } from "../hooks/use-setlist-navigation";

interface PerformFooterProps {
  visible: boolean;
  current: FlatEntry;
  prevSong: Song | undefined;
  nextSong: Song | undefined;
}

export function PerformFooter({ visible, current, prevSong, nextSong }: PerformFooterProps) {
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
            {nextSong && (
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
