import {
  type ChorusRecallLine,
  type CommentLine,
  type LyricLine,
  parse,
  type Section,
  type Segment,
  type SongLine,
} from "@domain/chordpro/parser";
import { transposeChord } from "@domain/chords/transpose";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface ChordTapInfo {
  chord: string;
  anchorRect: { x: number; y: number; width: number; height: number };
}

interface ChordProViewProps {
  content: string;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
}

export function ChordProView({ content, transposition, onChordTap }: ChordProViewProps) {
  const { t } = useTranslation();
  const parsed = useMemo(() => parse(content), [content]);

  if (parsed.sections.length === 0 && content.trim() === "") {
    return <p className="text-text-faint italic">{t("perform.noContent")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {parsed.setup && (
        <div
          title={t("chordpro.setup")}
          className="whitespace-pre-wrap rounded-md border border-accent bg-accent-muted px-3 py-2 text-perform-lyrics font-bold text-text"
        >
          {parsed.setup}
        </div>
      )}
      {parsed.sections.map((section, si) => (
        <SectionView
          // biome-ignore lint/suspicious/noArrayIndexKey: sections are static parsed output
          key={si}
          section={section}
          transposition={transposition}
          onChordTap={onChordTap}
        />
      ))}
    </div>
  );
}

function ChordToken({
  chord,
  transposition,
  onChordTap,
  className,
}: {
  chord: string;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
  className?: string;
}) {
  const displayChord = transposition ? transposeChord(chord, transposition) : chord;
  const base = `text-perform-chord font-bold text-chord${onChordTap ? " cursor-pointer" : ""}`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role is conditionally "button" when interactive
    <span
      data-chord-tap={onChordTap ? "" : undefined}
      role={onChordTap ? "button" : undefined}
      tabIndex={onChordTap ? 0 : undefined}
      className={className ? `${base} ${className}` : base}
      onClick={
        onChordTap
          ? (e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onChordTap({
                chord: displayChord,
                anchorRect: { x: r.x, y: r.y, width: r.width, height: r.height },
              });
            }
          : undefined
      }
      onKeyDown={
        onChordTap
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onChordTap({
                  chord: displayChord,
                  anchorRect: { x: r.x, y: r.y, width: r.width, height: r.height },
                });
              }
            }
          : undefined
      }
    >
      {displayChord}
    </span>
  );
}

const SECTION_HEADER_CLASS =
  "mb-1 text-perform-section font-medium uppercase tracking-wider text-text-faint";

function SectionView({
  section,
  transposition,
  onChordTap,
}: {
  section: Section;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
}) {
  const bgClass =
    section.type === "verse"
      ? "bg-section-verse"
      : section.type === "chorus"
        ? "bg-section-chorus"
        : section.type === "bridge"
          ? "bg-section-bridge"
          : "";
  // A standalone chorus recall renders its own header
  const recallOnly = section.lines.every((l) => l.kind === "chorus-recall");

  return (
    <div
      className={`rounded-md px-3 py-2 ${bgClass}${section.renderMode === "monospace" ? " font-mono" : ""}`}
    >
      {!recallOnly && section.label && <div className={SECTION_HEADER_CLASS}>{section.label}</div>}
      {!recallOnly && section.type !== "custom" && !section.label && (
        <div className={SECTION_HEADER_CLASS}>{section.type}</div>
      )}
      {section.lines.map((line, li) => (
        <SongLineView
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
          key={li}
          line={line}
          transposition={transposition}
          onChordTap={onChordTap}
        />
      ))}
    </div>
  );
}

function SongLineView({
  line,
  transposition,
  onChordTap,
}: {
  line: SongLine;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
}) {
  switch (line.kind) {
    case "comment":
      return <CommentView line={line} />;
    case "chorus-recall":
      return <ChorusRecallView line={line} transposition={transposition} onChordTap={onChordTap} />;
    default:
      return <LyricLineView line={line} transposition={transposition} onChordTap={onChordTap} />;
  }
}

const COMMENT_STYLE_CLASS: Record<CommentLine["style"], string> = {
  default: "text-text-muted font-medium",
  italic: "text-text-muted italic",
  box: "inline-block rounded-sm border border-border px-2 text-text",
  highlight: "inline-block rounded-sm bg-highlight px-1 text-text",
};

function CommentView({ line }: { line: CommentLine }) {
  return (
    <div className="leading-relaxed text-perform-chord whitespace-pre-wrap">
      <span className={COMMENT_STYLE_CLASS[line.style]}>
        {line.text}
        {line.instrument && <span className="text-text-faint"> ({line.instrument})</span>}
      </span>
    </div>
  );
}

function ChorusRecallView({
  line,
  transposition,
  onChordTap,
}: {
  line: ChorusRecallLine;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
}) {
  const { t } = useTranslation();
  const label = line.label ?? line.chorus?.label ?? t("chordpro.chorus");

  return (
    <div>
      <div className={`${SECTION_HEADER_CLASS} flex items-center gap-2`}>
        <span>{label}</span>
        <span className="rounded-sm border border-border px-1 normal-case tracking-normal">
          ↻ {t("chordpro.repeat")}
        </span>
      </div>
      {line.chorus?.lines.map((chorusLine, li) => (
        <SongLineView
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are static parsed output
          key={li}
          line={chorusLine}
          transposition={transposition}
          onChordTap={onChordTap}
        />
      ))}
    </div>
  );
}

function SegmentText({ seg }: { seg: Segment }) {
  return seg.highlight ? <span className="rounded-sm bg-highlight">{seg.text}</span> : seg.text;
}

function LyricLineView({
  line,
  transposition,
  onChordTap,
}: {
  line: LyricLine;
  transposition?: number;
  onChordTap?: (info: ChordTapInfo) => void;
}) {
  return (
    <div className="leading-relaxed">
      {line.segments.every((s) => s.text === "" && !s.chord) ? (
        <div className="h-3" />
      ) : line.segments.every((s) => !s.text.trim()) ? (
        <div className="text-perform-chord font-bold text-chord whitespace-pre-wrap">
          {line.segments.map((seg, si) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
            <span key={si}>
              {seg.chord && (
                <ChordToken
                  chord={seg.chord}
                  transposition={transposition}
                  onChordTap={onChordTap}
                />
              )}
              {seg.text}
            </span>
          ))}
        </div>
      ) : line.segments.some((s) => s.chord) &&
        line.segments.filter((s) => s.chord).every((s) => !s.text.trim()) ? (
        <div className="text-perform-lyrics whitespace-pre-wrap">
          {line.segments.map((seg, si) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
            <span key={si}>
              {seg.chord && (
                <ChordToken
                  chord={seg.chord}
                  transposition={transposition}
                  onChordTap={onChordTap}
                />
              )}
              <SegmentText seg={seg} />
            </span>
          ))}
        </div>
      ) : (
        <div
          className={`text-perform-lyrics whitespace-pre-wrap${
            line.segments.some((s) => s.chord) ? " relative pt-[var(--text-perform-chord)]" : ""
          }`}
          style={
            line.segments.some((s) => s.chord)
              ? { lineHeight: "calc(1em + var(--text-perform-chord) + 0.125rem)" }
              : undefined
          }
        >
          {line.segments.map((seg, si) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are static parsed output
              key={si}
              className={seg.chord ? "relative" : undefined}
            >
              {seg.chord && (
                <ChordToken
                  chord={seg.chord}
                  transposition={transposition}
                  onChordTap={onChordTap}
                  className="absolute bottom-full left-0 leading-none"
                />
              )}
              {seg.chord && seg.text.length < seg.chord.length + 2 ? (
                // Short fragment: overlay text and an invisible chord-width spacer in one grid
                // cell so the segment is as wide as the wider of the two (no chord overlap).
                <span className="inline-grid">
                  <span className="col-start-1 row-start-1">
                    <SegmentText seg={seg} />
                  </span>
                  <span
                    className="invisible col-start-1 row-start-1 text-perform-chord font-bold"
                    aria-hidden="true"
                  >
                    {transposition ? transposeChord(seg.chord, transposition) : seg.chord}
                    {" "}
                  </span>
                </span>
              ) : (
                <SegmentText seg={seg} />
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
