import { getGuitarFingerings } from "@domain/chords/guitar";
import { chordMidi, parseChordSuffix } from "@domain/chords/theory";
import { arrow, autoPlacement, computePosition, offset, shift } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FretboardDiagram } from "../../chords/components/fretboard-diagram";
import { KeyboardDiagram } from "../../chords/components/keyboard-diagram";

interface ChordPopoverProps {
  chord: string;
  anchorRect: { x: number; y: number; width: number; height: number };
  instrument: "guitar" | "piano";
  onClose: () => void;
}

interface Pos {
  x: number;
  y: number;
  arrowX: number | undefined;
  arrowY: number | undefined;
  placement: string;
}

export function ChordPopover({ chord, anchorRect, instrument, onClose }: ChordPopoverProps) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const floating = floatingRef.current;
    const arrowEl = arrowRef.current;
    if (!floating || !arrowEl) return;

    const virtualEl = {
      getBoundingClientRect: () => ({
        x: anchorRect.x,
        y: anchorRect.y,
        width: anchorRect.width,
        height: anchorRect.height,
        top: anchorRect.y,
        left: anchorRect.x,
        right: anchorRect.x + anchorRect.width,
        bottom: anchorRect.y + anchorRect.height,
      }),
    };

    computePosition(virtualEl, floating, {
      strategy: "fixed",
      middleware: [
        offset(8),
        autoPlacement({ allowedPlacements: ["top", "bottom", "right", "left"] }),
        shift({ padding: 8 }),
        arrow({ element: arrowEl }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      setPos({
        x,
        y,
        arrowX: middlewareData.arrow?.x,
        arrowY: middlewareData.arrow?.y,
        placement,
      });
    });
  }, [anchorRect]);

  const side = pos?.placement.split("-")[0] ?? "bottom";
  const arrowSide = { top: "bottom", bottom: "top", left: "right", right: "left" }[side] as string;

  // On a rotate(45deg) square, the CSS border edges map to diamond corners:
  //   point UP    → border-top + border-left
  //   point DOWN  → border-bottom + border-right
  //   point LEFT  → border-bottom + border-left
  //   point RIGHT → border-top + border-right
  const arrowBorders: Record<string, React.CSSProperties> = {
    bottom: { borderBottom: "1px solid", borderRight: "1px solid" },
    top: { borderTop: "1px solid", borderLeft: "1px solid" },
    right: { borderTop: "1px solid", borderRight: "1px solid" },
    left: { borderBottom: "1px solid", borderLeft: "1px solid" },
  };
  const arrowStyle: React.CSSProperties = {
    left: pos?.arrowX != null ? pos.arrowX : undefined,
    top: pos?.arrowY != null ? pos.arrowY : undefined,
    [arrowSide]: -5,
    ...arrowBorders[arrowSide],
  };

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-50"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is only stopPropagation, not real interaction */}
      <div
        ref={floatingRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${chord} chord diagram`}
        className="z-50 rounded-lg border border-white/10 bg-bg-raised/80 p-3 shadow-lg backdrop-blur-xl"
        style={{
          position: "fixed",
          left: pos ? pos.x : anchorRect.x,
          top: pos ? pos.y : anchorRect.y,
          opacity: pos ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ChordDiagram chord={chord} instrument={instrument} />
        <div
          ref={arrowRef}
          className="absolute h-2.5 w-2.5 rotate-45 border-white/10 bg-bg-raised/80 backdrop-blur-xl"
          style={arrowStyle}
        />
      </div>
    </>,
    document.body,
  );
}

function ChordDiagram({ chord, instrument }: { chord: string; instrument: "guitar" | "piano" }) {
  if (instrument === "guitar") {
    const fingerings = getGuitarFingerings(chord);
    if (fingerings.length === 0) return <NoData chord={chord} />;
    const f = fingerings[0];
    return (
      <FretboardDiagram
        name={chord}
        frets={f.frets}
        baseFret={f.baseFret}
        barres={f.barres}
        width={100}
      />
    );
  }

  const parsed = parseChordSuffix(chord);
  if (!parsed) return <NoData chord={chord} />;
  const midi = chordMidi(parsed.root, parsed.intervals);
  if (midi.length === 0) return <NoData chord={chord} />;
  return <KeyboardDiagram name={chord} midi={midi} width={160} />;
}

function NoData({ chord }: { chord: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-2 text-text-muted">
      <span className="text-lg font-bold">{chord}</span>
      <span className="text-sm">No diagram available</span>
    </div>
  );
}
