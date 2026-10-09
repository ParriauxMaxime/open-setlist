import type { ChordDefinition } from "@domain/chordpro/parser";
import { definedFingerings, getFingerings } from "@domain/chords/fingerings";
import { formatChord } from "@domain/chords/notation";
import { parseChord, pianoVoicing } from "@domain/chords/theory";
import type { InstrumentType } from "@domain/chords/types";
import { arrow, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FretboardDiagram } from "../../chords/components/fretboard-diagram";
import { KeyboardDiagram } from "../../chords/components/keyboard-diagram";
import { useNotation } from "../../shared/hooks/use-notation";

interface ChordPopoverProps {
  chord: string;
  anchorRect: { x: number; y: number; width: number; height: number };
  instrument: InstrumentType;
  /** The song's `{define}` voicings: they win over the built-in diagrams */
  definitions?: readonly ChordDefinition[];
  onClose: () => void;
}

interface Pos {
  x: number;
  y: number;
  arrowX: number | undefined;
  arrowY: number | undefined;
  placement: string;
}

export function ChordPopover({
  chord,
  anchorRect,
  instrument,
  definitions,
  onClose,
}: ChordPopoverProps) {
  const { t } = useTranslation();
  const floatingRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const notation = useNotation();
  // `chord` stays English for the diagram lookup; only the shown name follows the notation.
  const label = formatChord(chord, notation);

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
      placement: "top",
      strategy: "fixed",
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ["bottom", "right", "left"] }),
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
        aria-label={t("a11y.close")}
        tabIndex={-1}
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: onClick is only stopPropagation, not real interaction */}
      <div
        ref={floatingRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} chord diagram`}
        className="z-50 rounded-lg border border-white/10 bg-bg-raised/80 p-3 shadow-lg backdrop-blur-xl"
        style={{
          position: "fixed",
          left: pos ? pos.x : anchorRect.x,
          top: pos ? pos.y : anchorRect.y,
          opacity: pos ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ChordDiagram
          chord={chord}
          label={label}
          instrument={instrument}
          definitions={definitions}
        />
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

function ChordDiagram({
  chord,
  label,
  instrument,
  definitions = [],
}: {
  chord: string;
  label: string;
  instrument: InstrumentType;
  definitions?: readonly ChordDefinition[];
}) {
  if (instrument === "piano") {
    const parsed = parseChord(chord);
    if (!parsed) return <NoData chord={label} />;
    const { notes, bass } = pianoVoicing(parsed);
    return <KeyboardDiagram name={label} midi={notes} bass={bass} width={160} />;
  }

  const f =
    definedFingerings(definitions, instrument, chord)[0] ?? getFingerings(instrument, chord)[0];
  if (!f) return <NoData chord={label} />;
  return (
    <FretboardDiagram
      name={label}
      frets={f.frets}
      baseFret={f.baseFret}
      barres={f.barres}
      width={100}
    />
  );
}

function NoData({ chord }: { chord: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-2 text-text-muted">
      <span className="text-lg font-bold">{chord}</span>
      <span className="text-sm">{t("chordLib.noDiagram")}</span>
    </div>
  );
}
