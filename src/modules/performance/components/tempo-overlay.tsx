import { type BeatStore, useBeat } from "../hooks/use-tempo";

/**
 * Beat feedback that stays visible when the header is hidden: a thin accent
 * line flashing at the top edge, plus big 1-2-3-4 numbers during a count-in.
 */
export function TempoOverlay({ beats }: { beats: BeatStore }) {
  const beat = useBeat(beats);
  if (!beat) return null;

  return (
    <>
      <div
        key={`edge-${beat.index}`}
        aria-hidden="true"
        className="tempo-flash pointer-events-none fixed inset-x-0 top-0 z-20 h-1 bg-accent"
        data-accent={beat.accent}
      />
      {beat.countIn && (
        <div
          aria-live="assertive"
          className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center"
        >
          <span
            key={`count-${beat.index}`}
            className="tempo-count flex size-40 items-center justify-center rounded-full bg-bg-surface/85 text-8xl font-bold text-accent tabular-nums"
          >
            {beat.beat}
          </span>
        </div>
      )}
    </>
  );
}
